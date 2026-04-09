import { defineCommand } from "citty"
import { log } from "@clack/prompts"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { getComposeServices, spawnComposeLogs } from "../../core/compose"
import { DEV_COMPOSE } from "../../constants"

export const logs = defineCommand({
  meta: { name: "logs", description: "Follow dev infrastructure logs" },
  run: async () => {
    const ctx = getContext()
    log.info(t("dev.logs.following"))
    const services = getComposeServices(ctx, DEV_COMPOSE)
    await spawnComposeLogs(ctx, DEV_COMPOSE, services)
  },
})
