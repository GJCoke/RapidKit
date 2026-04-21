import { resolve } from "node:path"
import { readdirSync, unlinkSync, existsSync } from "node:fs"
import { type TaskRunner } from "../infra/runner"
import { hasCommand } from "../infra/runner"
import { buildComposeCommand, buildComposeRunCommand } from "../infra/compose"
import { t } from "../infra/i18n"
import { getContext, type FluxContext } from "../context"
import { BACKEND_DIR, DEV_COMPOSE, MIGRATION_DIR, PLUGINS_DIR } from "../constants"
import type { DbCredentials } from "../infra/env"

/**
 * Delete all .py migration files (preserve __init__.py) across all plugin version dirs.
 */
export function cleanMigrationFiles(runner: TaskRunner): void {
  const ctx = getContext()

  runner.exec({ label: t("db.reset.cleanMigrations") }, () => {
    // Clean main migration dir
    const mainDir = resolve(ctx.cwd, MIGRATION_DIR)
    cleanPyFiles(mainDir)

    // Clean per-plugin migration dirs
    const pluginsRoot = resolve(ctx.cwd, PLUGINS_DIR)
    if (existsSync(pluginsRoot)) {
      for (const d of readdirSync(pluginsRoot, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const versionsDir = resolve(pluginsRoot, d.name, "migrations", "versions")
        cleanPyFiles(versionsDir)
      }
    }
  })
}

function cleanPyFiles(dir: string): number {
  try {
    let count = 0
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".py") && f !== "__init__.py") {
        unlinkSync(resolve(dir, f))
        count++
      }
    }
    return count
  } catch {
    return 0
  }
}

function countPyFiles(dir: string): number {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".py") && f !== "__init__.py").length
  } catch {
    return 0
  }
}

/**
 * Get migration file counts per plugin (and alembic main dir).
 * Only returns entries with count > 0.
 */
export function getMigrationFileStats(): Array<{ plugin: string; dir: string; count: number }> {
  const ctx = getContext()
  const stats: Array<{ plugin: string; dir: string; count: number }> = []

  // Main alembic/versions
  const mainDir = resolve(ctx.cwd, MIGRATION_DIR)
  const mainCount = countPyFiles(mainDir)
  if (mainCount > 0) {
    stats.push({ plugin: "alembic", dir: mainDir, count: mainCount })
  }

  // Per-plugin
  const pluginsRoot = resolve(ctx.cwd, PLUGINS_DIR)
  if (existsSync(pluginsRoot)) {
    for (const d of readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const versionsDir = resolve(pluginsRoot, d.name, "migrations", "versions")
      const count = countPyFiles(versionsDir)
      if (count > 0) {
        stats.push({ plugin: d.name, dir: versionsDir, count })
      }
    }
  }

  return stats
}

/**
 * Delete migration .py files for a specific plugin (or "alembic" for main dir).
 * Preserves __init__.py. Returns the number of deleted files.
 */
export function cleanPluginMigrationFiles(pluginName: string): number {
  const ctx = getContext()

  let dir: string
  if (pluginName === "alembic") {
    dir = resolve(ctx.cwd, MIGRATION_DIR)
  } else {
    dir = resolve(ctx.cwd, PLUGINS_DIR, pluginName, "migrations", "versions")
  }

  return cleanPyFiles(dir)
}

/**
 * DROP SCHEMA public CASCADE; CREATE SCHEMA public; via psql in compose container.
 */
export async function dropAndRecreateSchema(
  runner: TaskRunner,
  ctx: FluxContext,
  credentials: DbCredentials,
): Promise<void> {
  const dropSql = "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  const { cmd, args } = buildComposeCommand(ctx, DEV_COMPOSE, [
    "exec",
    "-T",
    "-e",
    `PGPASSWORD=${credentials.password}`,
    "postgresql",
    "psql",
    "-U",
    credentials.user,
    "-d",
    credentials.database,
    "-c",
    dropSql,
  ])
  await runner.run({ label: t("db.reset.dropSchema") }, cmd, args)
}

/**
 * Run alembic upgrade heads (local mode).
 */
export async function upgrade(runner: TaskRunner): Promise<void> {
  if (!hasCommand("uv")) return
  const cwd = resolve(getContext().cwd, BACKEND_DIR)
  await runner.run({ label: t("db.migrating"), cwd }, "uv", ["run", "alembic", "upgrade", "heads"])
}

/**
 * Run python src/initdb.py (local mode).
 */
export async function seed(runner: TaskRunner): Promise<void> {
  if (!hasCommand("uv")) return
  const cwd = resolve(getContext().cwd, BACKEND_DIR)
  await runner.run({ label: t("db.seeding"), cwd }, "uv", ["run", "python", "src/initdb.py"])
}

/**
 * Run alembic upgrade heads inside a compose container (prod mode).
 */
export async function upgradeInCompose(
  runner: TaskRunner,
  ctx: FluxContext,
  composeFile: string,
  service: string,
): Promise<void> {
  const cmd = buildComposeRunCommand(ctx, composeFile, service, ["uv", "run", "alembic", "upgrade", "heads"])
  await runner.run({ label: t("db.migrating") }, cmd.cmd, cmd.args)
}

/**
 * Run python src/initdb.py inside a compose container (prod mode).
 */
export async function seedInCompose(
  runner: TaskRunner,
  ctx: FluxContext,
  composeFile: string,
  service: string,
): Promise<void> {
  const cmd = buildComposeRunCommand(ctx, composeFile, service, ["uv", "run", "python", "src/initdb.py"])
  await runner.run({ label: t("db.seeding") }, cmd.cmd, cmd.args)
}
