import { confirm, isCancel, log, password } from "@clack/prompts"
import { resolve } from "node:path"
import { readdirSync, readFileSync, unlinkSync } from "node:fs"
import { execCommand, hasCommand, type TaskRunner } from "./runner"
import { buildComposeCommand, buildComposeRunCommand } from "./compose"
import { t } from "./i18n"
import { FluxError } from "../errors"
import { getContext, type FluxContext } from "../context"
import { BACKEND_DIR, DEV_COMPOSE, MIGRATION_DIR } from "../constants"

interface InitDatabaseOptions {
  doubleConfirm?: boolean
  compose?: { file: string; service: string }
}

function hasMigrationFiles(): boolean {
  const cwd = getContext().cwd
  const dir = resolve(cwd, MIGRATION_DIR)
  try {
    const files = readdirSync(dir)
    return files.some((f) => f.endsWith(".py") && f !== "__init__.py")
  } catch {
    return false
  }
}

export function ensureMigrationFiles(runner: TaskRunner): void {
  if (hasMigrationFiles()) return

  if (!hasCommand("uv")) {
    log.warn(t("db.pythonNotFound"))
    return
  }

  const cwd = resolve(getContext().cwd, BACKEND_DIR)
  runner.exec({ label: t("db.generating") }, () => {
    execCommand('uv run alembic revision --autogenerate -m "init"', { cwd })
  })
}

export async function initDatabase(runner: TaskRunner, options?: InitDatabaseOptions): Promise<void> {
  const shouldInit = await confirm({ message: t("db.confirm") })
  if (isCancel(shouldInit) || !shouldInit) return

  if (options?.doubleConfirm) {
    const confirmAgain = await confirm({ message: t("db.doubleConfirm") })
    if (isCancel(confirmAgain) || !confirmAgain) return
  }

  const ctx = getContext()

  if (options?.compose) {
    const { file, service } = options.compose

    const migrate = buildComposeRunCommand(ctx, file, service, ["uv", "run", "alembic", "upgrade", "head"])
    await runner.run({ label: t("db.migrating") }, migrate.cmd, migrate.args)

    const seed = buildComposeRunCommand(ctx, file, service, ["uv", "run", "python", "src/initdb.py"])
    await runner.run({ label: t("db.seeding") }, seed.cmd, seed.args)
  } else {
    if (!hasCommand("uv")) {
      log.warn(t("db.pythonNotFound"))
      return
    }

    ensureMigrationFiles(runner)

    const cwd = resolve(ctx.cwd, BACKEND_DIR)

    runner.exec({ label: t("db.migrating") }, () => {
      execCommand("uv run alembic upgrade head", { cwd })
    })

    runner.exec({ label: t("db.seeding") }, () => {
      execCommand("uv run python src/initdb.py", { cwd })
    })
  }
}

/**
 * 删除 alembic migration 文件 + DROP SCHEMA public CASCADE
 */
export async function resetDatabase(runner: TaskRunner, ctx: FluxContext): Promise<void> {
  // 1. 删除 alembic/versions/*.py（保留 __init__.py）
  runner.exec({ label: t("db.reset.cleanMigrations") }, () => {
    const dir = resolve(ctx.cwd, MIGRATION_DIR)
    try {
      const files = readdirSync(dir)
      for (const f of files) {
        if (f.endsWith(".py") && f !== "__init__.py") {
          unlinkSync(resolve(dir, f))
        }
      }
    } catch {
      // versions 目录不存在时忽略
    }
  })

  // 2. DROP SCHEMA public CASCADE; CREATE SCHEMA public;
  const envPath = resolve(ctx.cwd, BACKEND_DIR, ".env")
  const { user, database, password: dbPassword } = readDbCredentials(envPath)

  let finalPassword = dbPassword
  if (!finalPassword) {
    const input = await password({ message: t("db.reset.password") })
    if (isCancel(input)) return
    finalPassword = input
  }

  const dropSql = "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  const { cmd, args } = buildComposeCommand(ctx, DEV_COMPOSE, [
    "exec",
    "-T",
    "-e",
    `PGPASSWORD=${finalPassword}`,
    "postgresql",
    "psql",
    "-U",
    user,
    "-d",
    database,
    "-c",
    dropSql,
  ])
  await runner.run({ label: t("db.reset.dropSchema") }, cmd, args)
}

/**
 * 重新生成 migration + upgrade + seed（在 resetDatabase 之后调用）
 */
export function rebuildDatabase(runner: TaskRunner): void {
  if (!hasCommand("uv")) {
    log.warn(t("db.pythonNotFound"))
    return
  }

  const cwd = resolve(getContext().cwd, BACKEND_DIR)

  runner.exec({ label: t("db.migrating") }, () => {
    execCommand("uv run alembic upgrade head", { cwd })
  })

  runner.exec({ label: t("db.seeding") }, () => {
    execCommand("uv run python src/initdb.py", { cwd })
  })
}

/**
 * 从后端 .env 文件读取数据库用户名和库名
 */
export function readDbCredentials(envPath: string): { user: string; database: string; password: string } {
  let user = "root"
  let database = "client"
  let pwd = ""

  try {
    const content = readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue
      const [key, ...rest] = trimmed.split("=")
      const value = rest.join("=").trim()
      if (key.trim() === "POSTGRESQL_USERNAME") user = value
      if (key.trim() === "POSTGRESQL_DATABASE") database = value
      if (key.trim() === "POSTGRESQL_PASSWORD") pwd = value
    }
  } catch {
    // 读取失败时使用默认值
  }

  return { user, database, password: pwd }
}
