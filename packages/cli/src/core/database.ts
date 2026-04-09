import { confirm, isCancel, log } from "@clack/prompts"
import { resolve } from "node:path"
import { readdirSync } from "node:fs"
import { execCommand, hasCommand, type TaskRunner } from "./runner"
import { buildComposeRunCommand } from "./compose"
import { t } from "./i18n"
import { FluxError } from "../errors"
import { getContext } from "../context"
import { BACKEND_DIR, MIGRATION_DIR } from "../constants"

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
