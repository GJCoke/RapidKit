import { defineCommand } from "citty"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildComposeCommand } from "../../core/compose"
import { initDatabase } from "../../core/database"
import { DEV_COMPOSE } from "../../constants"

export const up = defineCommand({
  meta: { name: "up", description: "Start dev infrastructure" },
  run: async () => {
    const ctx = getContext()
    const runner = createTaskRunner({ title: t("dev.up.title"), ctx })

    const cmd = buildComposeCommand(ctx, DEV_COMPOSE, ["up", "-d"])
    await runner.run({ label: t("dev.up.starting") }, cmd.cmd, cmd.args)

    await initDatabase(runner)

    runner.done()
  },
})
