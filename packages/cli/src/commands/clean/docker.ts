import { confirm, isCancel } from "@clack/prompts"
import { t } from "../../infra/i18n"
import { buildComposeCommand } from "../../infra/compose"
import { FluxError } from "../../errors"
import { DEV_COMPOSE, PROD_COMPOSE } from "../../constants"
import { defineFluxCommand } from "../_shared"

export const docker = defineFluxCommand({
  meta: { description: t("clean.docker.title") },
  async run({ ctx, runner }) {
    const shouldClean = await confirm({ message: t("clean.docker.confirm") })
    if (isCancel(shouldClean) || !shouldClean) {
      throw new FluxError("", "CANCELLED")
    }

    const devCmd = buildComposeCommand(ctx, DEV_COMPOSE, ["down", "-v"])
    await runner.run({ label: t("clean.dev") }, devCmd.cmd, devCmd.args)

    const prodCmd = buildComposeCommand(ctx, PROD_COMPOSE, ["down", "-v", "--rmi", "local"])
    await runner.run({ label: t("clean.prod") }, prodCmd.cmd, prodCmd.args)
  },
})
