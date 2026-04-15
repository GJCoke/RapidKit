import { multiselect, confirm, isCancel, log } from "@clack/prompts"
import { resolve } from "node:path"
import { t } from "../infra/i18n"
import { execCommand, type TaskRunner } from "../infra/runner"
import { buildMigrateArgs } from "./alembic"
import { findPlugin } from "./plugins"
import { getContext } from "../context"
import { BACKEND_DIR } from "../constants"

export interface PluginChange {
  type: string
  table: string
  detail: string
}

export interface PluginChangeInfo {
  name: string
  status: "initial" | "changed" | "up_to_date"
  hasMigrations: boolean
  changes: PluginChange[]
}

interface DetectResult {
  plugins: PluginChangeInfo[]
  unassigned?: PluginChange[]
}

/**
 * Call the Python probe to detect per-plugin model changes.
 */
export function detectChanges(runner: TaskRunner): PluginChangeInfo[] {
  const cwd = resolve(getContext().cwd, BACKEND_DIR)

  let output: string
  runner.exec({ label: t("db.migrate.detecting") }, () => {
    output = execCommand("uv run python scripts/alembic/detect_changes.py", { cwd })
  })

  const result: DetectResult = JSON.parse(output!)

  if (result.unassigned && result.unassigned.length > 0) {
    log.warn(
      t("db.migrate.unassigned", {
        tables: result.unassigned.map((c) => c.table).join(", "),
      }),
    )
  }

  return result.plugins
}

export interface GenerateOptions {
  runner: TaskRunner
  plugins: PluginChangeInfo[]
  message?: string
  mode: "interactive" | "auto"
}

/**
 * Generate migrations for selected plugins.
 *
 * - interactive: show multiselect with auto-preselected changed plugins
 * - auto: automatically select all initial + changed plugins
 */
export async function generateMigrations(options: GenerateOptions): Promise<boolean> {
  const { runner, plugins, mode } = options

  const actionable = plugins.filter((p) => p.status !== "up_to_date")

  if (actionable.length === 0) {
    log.warn(t("db.migrate.noChanges"))
    return false
  }

  let selected: PluginChangeInfo[]

  if (mode === "interactive") {
    const allPluginsWithChanges = plugins.filter((p) => p.status !== "up_to_date")

    const multiOptions = plugins
      .filter((p) => p.changes.length > 0 || p.status === "initial")
      .map((p) => {
        const hint =
          p.status === "initial"
            ? "initial migration"
            : p.changes
                .filter(
                  (c) =>
                    c.type.startsWith("add_table") ||
                    c.type.startsWith("add_column") ||
                    c.type.startsWith("remove_") ||
                    c.type.startsWith("modify_"),
                )
                .slice(0, 2)
                .map((c) => c.detail)
                .join(", ") || "changed"
        return {
          value: p.name,
          label: p.name,
          hint,
        }
      })

    if (multiOptions.length === 0) {
      log.warn(t("db.migrate.noChanges"))
      return false
    }

    const result = await multiselect({
      message: t("db.migrate.selectPlugins"),
      options: multiOptions,
      initialValues: allPluginsWithChanges.map((p) => p.name),
      cursorAt: multiOptions[0]?.value,
    })

    if (isCancel(result)) return false

    const selectedNames = result as string[]
    selected = plugins.filter((p) => selectedNames.includes(p.name))
  } else {
    selected = actionable
  }

  if (selected.length === 0) return false

  // Determine message
  let message = options.message
  if (!message) {
    if (mode === "auto") {
      const hasInitial = selected.some((p) => p.status === "initial")
      message = hasInitial ? "init" : "auto migrate"
    }
  }

  // In interactive mode, confirm before starting (generate + upgrade is atomic)
  if (mode === "interactive") {
    const shouldContinue = await confirm({ message: t("db.migrate.confirmGenerate") })
    if (isCancel(shouldContinue) || !shouldContinue) return false
  }

  const cwd = resolve(getContext().cwd, BACKEND_DIR)

  // Stamp all existing heads so alembic considers DB up-to-date before generating
  await runner.run({ label: t("db.stamping"), cwd }, "uv", ["run", "alembic", "stamp", "heads"])

  // Generate + upgrade each plugin atomically
  // upgrade executes DDL (creates tables) AND marks as applied,
  // so the next plugin's autogenerate sees the correct schema diff
  for (const info of selected) {
    const plugin = findPlugin(info.name)
    if (!plugin) continue

    const alembicArgs = buildMigrateArgs(plugin, message!)
    await runner.run({ label: t("db.migrate.generating", { plugin: info.name }), cwd }, "uv", alembicArgs)

    await runner.run({ label: t("db.upgrade.runningPlugin", { plugin: info.name }), cwd }, "uv", [
      "run",
      "alembic",
      "upgrade",
      `${info.name}@head`,
    ])
  }

  return true
}
