import { defineCommand } from "citty"
import { select, isCancel, log } from "@clack/prompts"
import { resolve } from "node:path"
import { getContext } from "../../context"
import { t, type MessageKey } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildMigrateArgs } from "../../core/alembic"
import { BACKEND_DIR } from "../../constants"
import { syncAlembicConfig, findPlugin, discoverPlugins, type Plugin } from "../../core/plugins"

export const migrate = defineCommand({
  meta: { name: "migrate", description: "Generate migration files" },
  args: {
    plugin: { type: "string", description: "Plugin name", required: false },
    m: { type: "string", description: "Migration message", required: false },
    message: { type: "string", description: "Migration message", required: false },
  },
  run: async ({ args }) => {
    const message = args.m || args.message
    if (!message) {
      log.error(t("db.migrate.messageRequired"))
      return
    }

    const ctx = getContext()
    const runner = createTaskRunner({ title: t("db.migrate.title"), ctx })

    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    let targetPlugin: Plugin | undefined

    if (args.plugin) {
      targetPlugin = findPlugin(args.plugin)
      if (!targetPlugin) {
        const available = discoverPlugins()
          .map((p) => p.name)
          .join(", ")
        log.error(t("db.migrate.pluginNotFound", { plugin: args.plugin, available }))
        return
      }
    } else {
      const plugins = discoverPlugins()
      if (plugins.length === 0) {
        log.warn(t("db.migrate.noChanges"))
        return
      }

      const options = plugins.map((p) => ({
        value: p.name,
        label: p.name,
        hint: p.hasMigrations ? "" : "initial migration",
      }))

      const selected = await select({
        message: t("db.migrate.selectPlugin"),
        options,
      })

      if (isCancel(selected)) return

      targetPlugin = findPlugin(selected as string)
    }

    if (!targetPlugin) return

    const alembicArgs = buildMigrateArgs(targetPlugin, message)
    const backendDir = resolve(ctx.cwd, BACKEND_DIR)

    await runner.run(
      { label: t("db.migrate.generating", { plugin: targetPlugin.name }), cwd: backendDir },
      "uv",
      alembicArgs,
    )

    runner.done()
  },
})
