import { resolve } from "node:path"
import { execCommand, type TaskRunner } from "../infra/runner"
import { t } from "../infra/i18n"
import { getContext } from "../context"
import { BACKEND_DIR } from "../constants"
import { buildMigrateArgs } from "./alembic.service"
import { findPlugin } from "./plugin.service"

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
 * Detect per-plugin model changes via Python probe script.
 * Returns pure data — no UI output. Caller is responsible for displaying warnings.
 */
export function detectChanges(runner: TaskRunner): { plugins: PluginChangeInfo[]; unassignedTables: string[] } {
  const cwd = resolve(getContext().cwd, BACKEND_DIR)

  let output: string
  runner.exec({ label: t("db.migrate.detecting") }, () => {
    output = execCommand("uv run python scripts/alembic/detect_changes.py", { cwd })
  })

  const result: DetectResult = JSON.parse(output!)

  const unassignedTables = (result.unassigned ?? []).map((c) => c.table)

  return { plugins: result.plugins, unassignedTables }
}

/**
 * Generate migrations for the given plugins.
 * Accepts an already-confirmed list — no UI interaction.
 */
export async function generateForPlugins(
  runner: TaskRunner,
  plugins: PluginChangeInfo[],
  message?: string,
): Promise<boolean> {
  if (plugins.length === 0) return false

  const cwd = resolve(getContext().cwd, BACKEND_DIR)

  // Determine message
  const finalMessage = message ?? (plugins.some((p) => p.status === "initial") ? "init" : "auto migrate")

  // Stamp all existing heads so alembic considers DB up-to-date before generating
  await runner.run({ label: t("db.stamping"), cwd }, "uv", ["run", "alembic", "stamp", "heads"])

  // Generate + upgrade each plugin atomically
  for (const info of plugins) {
    const plugin = findPlugin(info.name)
    if (!plugin) continue

    const alembicArgs = buildMigrateArgs(plugin, finalMessage)
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
