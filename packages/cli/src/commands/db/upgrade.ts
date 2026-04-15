import { defineCommand } from "citty"
import { resolve } from "node:path"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildUpgradeArgs } from "../../core/alembic"
import { syncAlembicConfig, findPlugin, discoverPlugins } from "../../core/plugins"
import { BACKEND_DIR } from "../../constants"

export const upgrade = defineCommand({
  meta: { name: "upgrade", description: "Run migrations" },
  args: {
    plugin: { type: "string", description: "Plugin name", required: false },
  },
  run: async ({ args }) => {
    const ctx = getContext()
    const runner = createTaskRunner({ title: t("db.upgrade.title"), ctx })

    if (args.plugin) {
      const plugin = findPlugin(args.plugin)
      if (!plugin) {
        const available = discoverPlugins()
          .map((p) => p.name)
          .join(", ")
        throw new Error(t("db.migrate.pluginNotFound", { plugin: args.plugin, available }))
      }
    }

    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    const alembicArgs = buildUpgradeArgs(args.plugin)
    const label = args.plugin ? t("db.upgrade.runningPlugin", { plugin: args.plugin }) : t("db.upgrade.running")

    const backendDir = resolve(ctx.cwd, BACKEND_DIR)
    await runner.run({ label, cwd: backendDir }, "uv", alembicArgs)

    runner.done()
  },
})
