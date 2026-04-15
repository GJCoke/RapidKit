import { confirm, select, isCancel, log } from "@clack/prompts"
import { t } from "../../infra/i18n"
import * as alembicService from "../../services/alembic.service"
import { syncAlembicConfig, findPlugin, discoverPlugins } from "../../services/plugin.service"
import { defineFluxCommand } from "../_shared"

export const downgrade = defineFluxCommand({
  meta: { description: t("db.downgrade.title") },
  args: {
    plugin: { type: "string", description: "Plugin name", required: false },
    steps: { type: "string", description: "Number of steps to roll back", required: false },
  },
  async run({ runner, args }) {
    const steps = args.steps ? parseInt(args.steps as string, 10) : 1

    let pluginName: string

    if (args.plugin) {
      const plugin = findPlugin(args.plugin as string)
      if (!plugin) {
        const available = discoverPlugins()
          .map((p) => p.name)
          .join(", ")
        log.error(t("db.migrate.pluginNotFound", { plugin: args.plugin as string, available }))
        return
      }
      pluginName = args.plugin as string
    } else {
      const plugins = discoverPlugins().filter((p) => p.hasMigrations)
      if (plugins.length === 0) {
        log.warn(t("db.migrate.noChanges"))
        return
      }

      const selected = await select({
        message: t("db.downgrade.selectPlugin"),
        options: plugins.map((p) => ({ value: p.name, label: p.name })),
      })

      if (isCancel(selected)) return
      pluginName = selected as string
    }

    const shouldProceed = await confirm({
      message: t("db.downgrade.confirm", { plugin: pluginName, steps: String(steps) }),
    })

    if (isCancel(shouldProceed) || !shouldProceed) return

    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    await alembicService.downgrade(runner, t("db.downgrade.running", { plugin: pluginName }), pluginName, steps)
  },
})
