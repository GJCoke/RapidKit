import { confirm, isCancel } from "@clack/prompts"
import { t } from "../../infra/i18n"
import { syncAlembicConfig } from "../../services/plugin.service"
import * as databaseService from "../../services/database.service"
import * as migrationService from "../../services/migration.service"
import { defineFluxCommand } from "../_shared"

export const reset = defineFluxCommand({
  meta: { description: t("db.reset.title") },
  async run({ runner }) {
    // UI: confirm
    const shouldReset = await confirm({ message: t("db.reset.confirm") })
    if (isCancel(shouldReset) || !shouldReset) return

    const confirmAgain = await confirm({ message: t("db.reset.doubleConfirm") })
    if (isCancel(confirmAgain) || !confirmAgain) return

    // Clear the configured database before replacing its migration baseline.
    await databaseService.dropAndRecreateSchema(runner)
    databaseService.cleanMigrationFiles(runner)

    // 3. Sync config + detect + generate init migrations
    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    const { plugins } = migrationService.detectChanges(runner)
    const actionable = plugins.filter((p) => p.status !== "up_to_date")
    if (actionable.length > 0) {
      await migrationService.generateForPlugins(runner, actionable, "init")
    }

    // 4. Upgrade
    await databaseService.upgrade(runner)

    // 5. Optional seed (UI)
    const shouldSeed = await confirm({ message: t("db.reset.rebuild") })
    if (!isCancel(shouldSeed) && shouldSeed) {
      await databaseService.seed(runner, true)
    }
  },
})
