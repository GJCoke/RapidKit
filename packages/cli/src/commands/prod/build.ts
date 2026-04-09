import { defineCommand } from "citty"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildComposeCommand } from "../../core/compose"
import { PROD_COMPOSE } from "../../constants"

export const build = defineCommand({
  meta: { name: "build", description: "Build production images" },
  run: async () => {
    const ctx = getContext()
    const runner = createTaskRunner({ title: t("prod.build.description"), ctx })

    const cmd = buildComposeCommand(ctx, PROD_COMPOSE, ["build"])
    await runner.run({ label: t("prod.build.starting") }, cmd.cmd, cmd.args)

    runner.done()
  },
})
