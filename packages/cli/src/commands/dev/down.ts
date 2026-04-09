import { defineCommand } from "citty"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildComposeCommand } from "../../core/compose"
import { DEV_COMPOSE } from "../../constants"

export const down = defineCommand({
  meta: { name: "down", description: "Stop dev infrastructure" },
  run: async () => {
    const ctx = getContext()
    const runner = createTaskRunner({ title: t("dev.down.description"), ctx })

    const cmd = buildComposeCommand(ctx, DEV_COMPOSE, ["down"])
    await runner.run({ label: t("dev.down.starting") }, cmd.cmd, cmd.args)

    runner.done()
  },
})
