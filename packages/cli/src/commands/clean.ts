import { defineCommand } from "citty"
import { confirm, isCancel } from "@clack/prompts"
import { getContext } from "../context"
import { t } from "../core/i18n"
import { createTaskRunner } from "../core/runner"
import { buildComposeCommand } from "../core/compose"
import { FluxError } from "../errors"
import { DEV_COMPOSE, PROD_COMPOSE } from "../constants"

export const clean = defineCommand({
  meta: { name: "clean", description: "Clean containers, volumes, and images" },
  run: async () => {
    const ctx = getContext()

    const shouldClean = await confirm({ message: t("clean.confirm") })
    if (isCancel(shouldClean) || !shouldClean) {
      throw new FluxError("", "CANCELLED")
    }

    const runner = createTaskRunner({ title: t("clean.title"), ctx })

    const devCmd = buildComposeCommand(ctx, DEV_COMPOSE, ["down", "-v"])
    await runner.run({ label: t("clean.dev") }, devCmd.cmd, devCmd.args)

    const prodCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["down", "-v", "--rmi", "local"])
    await runner.run({ label: t("clean.prod") }, prodCmd.cmd, prodCmd.args)

    runner.done()
  },
})
