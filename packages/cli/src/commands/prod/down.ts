import { defineCommand } from "citty"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildComposeCommand } from "../../core/compose"
import { PROD_COMPOSE } from "../../constants"

export const down = defineCommand({
  meta: { name: "down", description: "Stop production stack" },
  run: async () => {
    const ctx = getContext()
    const runner = createTaskRunner({ title: t("prod.down.description"), ctx })

    const cmd = buildComposeCommand(ctx, PROD_COMPOSE, ["down"])
    await runner.run({ label: t("prod.down.starting") }, cmd.cmd, cmd.args)

    runner.done()
  },
})
