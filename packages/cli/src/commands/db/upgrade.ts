import { t } from "../../infra/i18n"
import * as alembicService from "../../services/alembic.service"
import { syncAlembicConfig, findPlugin, discoverPlugins } from "../../services/plugin.service"
import { defineFluxCommand } from "../_shared"

export const upgrade = defineFluxCommand({
  meta: { description: t("db.upgrade.title") },
  args: {
    plugin: { type: "string", description: "Plugin name", required: false },
  },
  async run({ runner, args }) {
    const pluginName = args.plugin as string | undefined

    let canonicalName = pluginName
    if (pluginName) {
      const plugin = findPlugin(pluginName)
      if (!plugin) {
        const available = discoverPlugins()
          .map((p) => p.name)
          .join(", ")
        throw new Error(t("db.migrate.pluginNotFound", { plugin: pluginName, available }))
      }
      canonicalName = plugin.name
    }

    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    const label = canonicalName ? t("db.upgrade.runningPlugin", { plugin: canonicalName }) : t("db.upgrade.running")

    await alembicService.upgrade(runner, label, canonicalName)
  },
})
