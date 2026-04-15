import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { PLUGINS_DIR, BACKEND_DIR, ALEMBIC_INI, ALEMBIC_ENV } from "../constants"
import { getContext } from "../context"

export interface Plugin {
  name: string
  module: string
  versionPath: string
  hasMigrations: boolean
}

/**
 * Scan apps/backend/plugins/ for directories with migrations/versions/.
 */
export function discoverPlugins(): Plugin[] {
  const ctx = getContext()
  const pluginsRoot = resolve(ctx.cwd, PLUGINS_DIR)

  if (!existsSync(pluginsRoot)) return []

  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(pluginsRoot, d.name, "migrations", "versions")))
    .map((d) => {
      const versionsDir = join(pluginsRoot, d.name, "migrations", "versions")
      const files = readdirSync(versionsDir).filter((f) => f.endsWith(".py") && f !== "__init__.py")
      return {
        name: d.name,
        module: `plugin_${d.name}`,
        versionPath: `plugins/${d.name}/migrations/versions`,
        hasMigrations: files.length > 0,
      }
    })
}

/**
 * Ensure alembic.ini version_locations includes all discovered plugins.
 * Returns true if changes were made.
 */
export function syncAlembicIni(): boolean {
  const ctx = getContext()
  const iniPath = resolve(ctx.cwd, ALEMBIC_INI)
  const plugins = discoverPlugins()

  let content = readFileSync(iniPath, "utf-8")
  const match = content.match(/^version_locations\s*=\s*(.+(?:\n\s+.+)*)$/m)
  if (!match) return false

  const rawValue = match[1].replace(/\n\s+/g, "")
  const existingPaths = rawValue
    .split(/[:\n]/)
    .map((p) => p.trim())
    .filter(Boolean)

  let changed = false
  for (const plugin of plugins) {
    if (!existingPaths.includes(plugin.versionPath)) {
      existingPaths.push(plugin.versionPath)
      changed = true
    }
  }

  if (changed) {
    const newValue = existingPaths.join(":")
    content = content.replace(/^(version_locations\s*=\s*)(.+(?:\n\s+.+)*)$/m, `$1${newValue}`)
    writeFileSync(iniPath, content, "utf-8")
  }

  return changed
}

/**
 * Ensure alembic/env.py PLUGIN_MODULES includes all discovered plugins.
 * Returns true if changes were made.
 */
export function syncAlembicEnv(): boolean {
  const ctx = getContext()
  const envPath = resolve(ctx.cwd, ALEMBIC_ENV)
  const plugins = discoverPlugins()

  let content = readFileSync(envPath, "utf-8")

  const listMatch = content.match(/PLUGIN_MODULES:\s*list\[str\]\s*=\s*\[([\s\S]*?)\]/)
  if (!listMatch) return false

  const existingModules = listMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)

  let changed = false
  for (const plugin of plugins) {
    if (!existingModules.includes(plugin.module)) {
      existingModules.push(plugin.module)
      changed = true
    }
  }

  if (changed) {
    const newList = existingModules.map((m) => `    "${m}"`).join(",\n")
    content = content.replace(
      /PLUGIN_MODULES:\s*list\[str\]\s*=\s*\[[\s\S]*?\]/,
      `PLUGIN_MODULES: list[str] = [\n${newList},\n]`,
    )
    writeFileSync(envPath, content, "utf-8")
  }

  return changed
}

/**
 * Run both sync operations. Returns true if any changes were made.
 */
export function syncAlembicConfig(): boolean {
  const iniChanged = syncAlembicIni()
  const envChanged = syncAlembicEnv()
  return iniChanged || envChanged
}

/**
 * Validate a plugin name exists. Returns the Plugin or undefined.
 */
export function findPlugin(name: string): Plugin | undefined {
  return discoverPlugins().find((p) => p.name === name)
}
