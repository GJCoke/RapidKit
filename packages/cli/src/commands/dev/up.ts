import { confirm, isCancel, log } from "@clack/prompts"
import { t } from "../../infra/i18n"
import { buildComposeCommand } from "../../infra/compose"
import { hasCommand } from "../../infra/runner"
import { DEV_COMPOSE } from "../../constants"
import { defineFluxCommand } from "../_shared"
import * as databaseService from "../../services/database.service"
import * as migrationService from "../../services/migration.service"

export const up = defineFluxCommand({
  meta: { description: t("dev.up.title") },
  async run({ ctx, runner }) {
    const cmd = buildComposeCommand(ctx, DEV_COMPOSE, ["up", "-d"])
    await runner.run({ label: t("dev.up.starting") }, cmd.cmd, cmd.args)

    // Database initialization (UI in command layer)
    const shouldInit = await confirm({ message: t("db.confirm") })
    if (isCancel(shouldInit) || !shouldInit) return

    if (!hasCommand("uv")) {
      log.warn(t("db.pythonNotFound"))
      return
    }

    // Auto-detect and generate migrations
    const { plugins } = migrationService.detectChanges(runner)
    const actionable = plugins.filter((p) => p.status !== "up_to_date")
    if (actionable.length > 0) {
      await migrationService.generateForPlugins(runner, actionable)
    }

    await databaseService.upgrade(runner)
    await databaseService.seed(runner)
  },
})
