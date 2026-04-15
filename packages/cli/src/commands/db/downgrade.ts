import { defineCommand } from "citty"
import { confirm, select, isCancel, log } from "@clack/prompts"
import { resolve } from "node:path"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildDowngradeArgs } from "../../core/alembic"
import { syncAlembicConfig, findPlugin, discoverPlugins } from "../../core/plugins"
import { BACKEND_DIR } from "../../constants"

export const downgrade = defineCommand({
  meta: { name: "downgrade", description: "Roll back migrations" },
  args: {
    plugin: { type: "string", description: "Plugin name", required: false },
    steps: { type: "string", description: "Number of steps to roll back", required: false },
  },
  run: async ({ args }) => {
    const ctx = getContext()
    const steps = args.steps ? parseInt(args.steps, 10) : 1

    let pluginName: string

    if (args.plugin) {
      const plugin = findPlugin(args.plugin)
      if (!plugin) {
        const available = discoverPlugins()
          .map((p) => p.name)
          .join(", ")
        log.error(t("db.migrate.pluginNotFound", { plugin: args.plugin, available }))
        return
      }
      pluginName = args.plugin
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

    const runner = createTaskRunner({ title: t("db.downgrade.title"), ctx })

    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    const alembicArgs = buildDowngradeArgs(pluginName, steps)
    const backendDir = resolve(ctx.cwd, BACKEND_DIR)

    await runner.run({ label: t("db.downgrade.running", { plugin: pluginName }), cwd: backendDir }, "uv", alembicArgs)

    runner.done()
  },
})
