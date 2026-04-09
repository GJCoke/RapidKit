import { defineCommand } from "citty"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildComposeCommand } from "../../core/compose"
import { ensureMigrationFiles, initDatabase } from "../../core/database"
import { PROD_COMPOSE, PROD_INFRA_SERVICES } from "../../constants"

export const up = defineCommand({
  meta: { name: "up", description: "Start production stack" },
  run: async () => {
    const ctx = getContext()
    const runner = createTaskRunner({ title: t("prod.up.title"), ctx })

    ensureMigrationFiles(runner)

    const buildCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["build"])
    await runner.run({ label: t("prod.build.starting") }, buildCmd.cmd, buildCmd.args)

    const infraCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["up", "-d", ...PROD_INFRA_SERVICES])
    await runner.run({ label: t("prod.up.infra") }, infraCmd.cmd, infraCmd.args)

    await initDatabase(runner, {
      doubleConfirm: true,
      compose: { file: PROD_COMPOSE, service: "backend-api" },
    })

    const upCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["up", "-d"])
    await runner.run({ label: t("prod.up.starting") }, upCmd.cmd, upCmd.args)

    runner.done()
  },
})
