import { defineCommand } from "citty"
import { log } from "@clack/prompts"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { getComposeServices, spawnComposeLogs } from "../../core/compose"
import { PROD_COMPOSE } from "../../constants"

export const logs = defineCommand({
  meta: { name: "logs", description: "Follow production logs" },
  run: async () => {
    const ctx = getContext()
    log.info(t("prod.logs.following"))
    const services = getComposeServices(ctx, PROD_COMPOSE)
    await spawnComposeLogs(ctx, PROD_COMPOSE, services)
  },
})
