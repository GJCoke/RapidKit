import { resolve } from "node:path"
import { BACKEND_DIR } from "../constants"
import { getContext } from "../context"
import { execCommand, type TaskRunner } from "../infra/runner"
import { t } from "../infra/i18n"
import type { Plugin } from "./plugin.service"

function getAlembicCwd(): string {
  return resolve(getContext().cwd, BACKEND_DIR)
}

export function buildMigrateArgs(plugin: Plugin, message: string): string[] {
  const args = ["run", "alembic", "revision", "--autogenerate", "-m", message]

  if (plugin.hasMigrations) {
    args.push(`--head=${plugin.name}@head`)
  } else {
    args.push(`--branch-label=${plugin.name}`, `--head=base`)
  }

  args.push(`--version-path=${plugin.versionPath}`)
  return args
}

export function buildUpgradeArgs(pluginName?: string): string[] {
  if (pluginName) {
    return ["run", "alembic", "upgrade", `${pluginName}@head`]
  }
  return ["run", "alembic", "upgrade", "heads"]
}

export function buildDowngradeArgs(pluginName: string, steps: number = 1): string[] {
  return ["run", "alembic", "downgrade", `${pluginName}@-${steps}`]
}

export function parseHeads(output: string): Map<string, string> {
  const heads = new Map<string, string>()
  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([0-9a-f]{12,})\s+\((\w+)\)\s+\(head\)/)
    if (match) {
      heads.set(match[2], match[1])
      continue
    }
    const mainMatch = trimmed.match(/^([0-9a-f]{12,})\s+\(head\)/)
    if (mainMatch) {
      heads.set("main", mainMatch[1])
    }
  }
  return heads
}

export function parseCurrent(output: string): Set<string> {
  const current = new Set<string>()
  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([0-9a-f]{12,})\b/)
    if (match) current.add(match[1])
  }
  return current
}

export async function upgrade(runner: TaskRunner, label: string, pluginName?: string): Promise<void> {
  const cwd = getAlembicCwd()
  const args = buildUpgradeArgs(pluginName)
  await runner.run({ label, cwd }, "uv", args)
}

export async function downgrade(runner: TaskRunner, label: string, pluginName: string, steps: number): Promise<void> {
  const cwd = getAlembicCwd()
  const args = buildDowngradeArgs(pluginName, steps)
  await runner.run({ label, cwd }, "uv", args)
}

export async function migrate(runner: TaskRunner, label: string, plugin: Plugin, message: string): Promise<void> {
  const cwd = getAlembicCwd()
  const args = buildMigrateArgs(plugin, message)
  await runner.run({ label, cwd }, "uv", args)
}

export async function stamp(runner: TaskRunner, label: string): Promise<void> {
  const cwd = getAlembicCwd()
  await runner.run({ label, cwd }, "uv", ["run", "alembic", "stamp", "heads"])
}

export async function getHeads(runner: TaskRunner): Promise<Map<string, string>> {
  const cwd = getAlembicCwd()
  let output: string
  runner.exec({ label: t("db.status.checking") }, () => {
    output = execCommand("uv run alembic heads", { cwd })
  })
  return parseHeads(output!)
}

export async function getCurrent(runner: TaskRunner): Promise<Set<string>> {
  const cwd = getAlembicCwd()
  let output: string
  runner.exec({ label: t("db.status.checking") }, () => {
    output = execCommand("uv run alembic current", { cwd })
  })
  return parseCurrent(output!)
}
