import { confirm, isCancel, log, password } from "@clack/prompts"
import { resolve } from "node:path"
import { t } from "../../../infra/i18n"
import { readDbCredentials } from "../../../infra/env"
import { BACKEND_DIR } from "../../../constants"
import { syncAlembicConfig } from "../../../services/plugin.service"
import * as databaseService from "../../../services/database.service"
import * as migrationService from "../../../services/migration.service"
import { defineFluxCommand } from "../../_shared"

export const reset = defineFluxCommand({
  meta: { description: t("db.reset.title") },
  async run({ ctx, runner }) {
    // UI: confirm
    const shouldReset = await confirm({ message: t("db.reset.confirm") })
    if (isCancel(shouldReset) || !shouldReset) return

    const confirmAgain = await confirm({ message: t("db.reset.doubleConfirm") })
    if (isCancel(confirmAgain) || !confirmAgain) return

    // 1. Clean migration files
    databaseService.cleanMigrationFiles(runner)

    // 2. Drop schema (UI: ask password if needed)
    const envPath = resolve(ctx.cwd, BACKEND_DIR, ".env")
    const creds = readDbCredentials(envPath)

    if (!creds.password) {
      const input = await password({ message: t("db.reset.password") })
      if (isCancel(input)) return
      creds.password = input
    }

    await databaseService.dropAndRecreateSchema(runner, ctx, creds)

    // 3. Rebuild?
    const shouldRebuild = await confirm({ message: t("db.reset.rebuild") })
    if (!isCancel(shouldRebuild) && shouldRebuild) {
      runner.exec({ label: t("db.migrate.syncing") }, () => {
        syncAlembicConfig()
      })

      const { plugins } = migrationService.detectChanges(runner)
      const actionable = plugins.filter((p) => p.status !== "up_to_date")
      if (actionable.length > 0) {
        await migrationService.generateForPlugins(runner, actionable, "init")
      }

      await databaseService.upgrade(runner)
      await databaseService.seed(runner)
    } else {
      log.info(t("db.reset.manualHint"))
    }
  },
})
