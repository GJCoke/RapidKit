import { BACKEND_DIR } from "../constants"
import { getContext } from "../context"
import { resolve } from "node:path"
import type { Plugin } from "./plugins"

/**
 * Build the base alembic command prefix. All alembic commands must run from BACKEND_DIR.
 */
function cwd(): string {
  const ctx = getContext()
  return resolve(ctx.cwd, BACKEND_DIR)
}

/**
 * Generate an autogenerate migration for a specific plugin.
 */
export function buildMigrateArgs(plugin: Plugin, message: string): string[] {
  const args = ["run", "alembic", "revision", "--autogenerate", "-m", message]

  if (plugin.hasMigrations) {
    args.push(`--head=${plugin.name}@head`)
  } else {
    // --head=base forces down_revision=None, creating a truly independent branch
    args.push(`--branch-label=${plugin.name}`, `--head=base`)
  }

  args.push(`--version-path=${plugin.versionPath}`)
  return args
}

/**
 * Build upgrade args.
 */
export function buildUpgradeArgs(pluginName?: string): string[] {
  if (pluginName) {
    return ["run", "alembic", "upgrade", `${pluginName}@head`]
  }
  return ["run", "alembic", "upgrade", "heads"]
}

/**
 * Build downgrade args.
 */
export function buildDowngradeArgs(pluginName: string, steps: number = 1): string[] {
  return ["run", "alembic", "downgrade", `${pluginName}@-${steps}`]
}

/**
 * Parse `alembic heads` output into a map of branch -> revision.
 */
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

/**
 * Parse `alembic current` output into a set of current revisions.
 */
export function parseCurrent(output: string): Set<string> {
  const current = new Set<string>()
  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Alembic revision IDs are 12-char hex strings, e.g. "a1b2c3d4e5f6 (head)"
    const match = trimmed.match(/^([0-9a-f]{12,})\b/)
    if (match) current.add(match[1])
  }
  return current
}

/**
 * Get the alembic working directory.
 */
export function getAlembicCwd(): string {
  return cwd()
}
