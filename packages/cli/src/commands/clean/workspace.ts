import { confirm, isCancel, log } from "@clack/prompts"
import { t } from "../../infra/i18n"
import { defineFluxCommand } from "../_shared"
import { discoverCleanTargets, cleanDirs } from "../../services/workspace.service"

export const workspace = defineFluxCommand({
  meta: { description: t("clean.workspace.title") },
  async run({ ctx, runner }) {
    const result = discoverCleanTargets(ctx.cwd)

    if (result.dirs.length === 0) {
      log.info(t("clean.workspace.nothingToClean"))
      return
    }

    log.info(t("clean.workspace.found", { count: String(result.dirs.length) }))
    for (const dir of result.dirs) {
      log.message(`  ${dir}`)
    }

    const shouldClean = await confirm({ message: t("clean.workspace.confirm") })
    if (isCancel(shouldClean) || !shouldClean) return

    await cleanDirs(runner, result.dirs)
    log.success(t("clean.workspace.done"))
  },
})
