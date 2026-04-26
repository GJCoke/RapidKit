import { log } from "@clack/prompts"
import { resolve } from "node:path"
import { t } from "../../infra/i18n"
import { defineFluxCommand } from "../_shared"
import { syncChangelogs } from "../../services/changelog.service"

const OUTPUT_DIR = "apps/website/src/changelog"

export const sync = defineFluxCommand({
  meta: { description: t("changelog.sync.title") },
  async run({ ctx }) {
    const outputDir = resolve(ctx.cwd, OUTPUT_DIR)
    const result = syncChangelogs(outputDir)

    if (result.copied.length === 0) {
      log.info(t("changelog.sync.noFiles"))
      return
    }

    for (const name of result.copied) {
      log.message(`  ${name}-CHANGELOG.md`)
    }

    log.success(t("changelog.sync.done", { count: String(result.copied.length) }))
  },
})
