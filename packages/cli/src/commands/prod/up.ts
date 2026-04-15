import { confirm, isCancel } from "@clack/prompts"
import { t } from "../../infra/i18n"
import { buildComposeCommand } from "../../infra/compose"
import { PROD_COMPOSE, PROD_INFRA_SERVICES } from "../../constants"
import { defineFluxCommand } from "../_shared"
import * as databaseService from "../../services/database.service"

export const up = defineFluxCommand({
  meta: { description: t("prod.up.title") },
  async run({ ctx, runner }) {
    const buildCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["build"])
    await runner.run({ label: t("prod.build.starting") }, buildCmd.cmd, buildCmd.args)

    const infraCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["up", "-d", ...PROD_INFRA_SERVICES])
    await runner.run({ label: t("prod.up.infra") }, infraCmd.cmd, infraCmd.args)

    // Database initialization (UI in command layer)
    const shouldInit = await confirm({ message: t("db.confirm") })
    if (isCancel(shouldInit) || !shouldInit) {
      // Skip DB init, just start all services
    } else {
      const confirmAgain = await confirm({ message: t("db.doubleConfirm") })
      if (!isCancel(confirmAgain) && confirmAgain) {
        await databaseService.upgradeInCompose(runner, ctx, PROD_COMPOSE, "backend-api")
        await databaseService.seedInCompose(runner, ctx, PROD_COMPOSE, "backend-api")
      }
    }

    const upCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["up", "-d"])
    await runner.run({ label: t("prod.up.starting") }, upCmd.cmd, upCmd.args)
  },
})
