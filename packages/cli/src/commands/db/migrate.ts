import { text, multiselect, confirm, isCancel, log } from "@clack/prompts"
import { t } from "../../infra/i18n"
import { syncAlembicConfig, findPlugin, discoverPlugins } from "../../services/plugin.service"
import * as alembicService from "../../services/alembic.service"
import * as migrationService from "../../services/migration.service"
import { defineFluxCommand } from "../_shared"

export const migrate = defineFluxCommand({
  meta: { description: t("db.migrate.title") },
  args: {
    plugin: { type: "string", description: "Plugin name", required: false },
    m: { type: "string", description: "Migration message", required: false },
    message: { type: "string", description: "Migration message", required: false },
    all: { type: "boolean", description: "Generate for all changed plugins (non-interactive)", required: false },
  },
  async run({ runner, args }) {
    let message = (args.m || args.message) as string | undefined

    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    // Single plugin mode: skip detection, generate directly
    if (args.plugin) {
      const targetPlugin = findPlugin(args.plugin as string)
      if (!targetPlugin) {
        const available = discoverPlugins()
          .map((p) => p.name)
          .join(", ")
        log.error(t("db.migrate.pluginNotFound", { plugin: args.plugin as string, available }))
        return
      }

      if (!message) {
        const input = await text({
          message: t("db.migrate.messageRequired"),
          placeholder: "e.g. add user table",
          validate: (value) => (!value.trim() ? t("db.migrate.messageRequired") : undefined),
        })
        if (isCancel(input)) return
        message = input as string
      }

      await alembicService.migrate(
        runner,
        t("db.migrate.generating", { plugin: targetPlugin.name }),
        targetPlugin,
        message,
      )
      return
    }

    // Multi-plugin mode: detect changes
    const { plugins, unassignedTables } = migrationService.detectChanges(runner)

    // UI: show unassigned table warnings
    if (unassignedTables.length > 0) {
      log.warn(t("db.migrate.unassigned", { tables: unassignedTables.join(", ") }))
    }

    // Ask for message
    if (!message) {
      if (args.all) {
        log.error(t("db.migrate.messageRequired"))
        return
      }

      const input = await text({
        message: t("db.migrate.messageRequired"),
        placeholder: "e.g. add user table",
        validate: (value) => (!value.trim() ? t("db.migrate.messageRequired") : undefined),
      })
      if (isCancel(input)) return
      message = input as string
    }

    const actionable = plugins.filter((p) => p.status !== "up_to_date")

    if (actionable.length === 0) {
      log.warn(t("db.migrate.noChanges"))
      return
    }

    let selected: typeof actionable

    if (args.all) {
      // Auto mode: select all actionable
      selected = actionable
    } else {
      // Interactive mode: UI multiselect
      const multiOptions = plugins
        .filter((p) => p.changes.length > 0 || p.status === "initial")
        .map((p) => {
          const hint =
            p.status === "initial"
              ? "initial migration"
              : p.changes
                  .filter(
                    (c) =>
                      c.type.startsWith("add_table") ||
                      c.type.startsWith("add_column") ||
                      c.type.startsWith("remove_") ||
                      c.type.startsWith("modify_"),
                  )
                  .slice(0, 2)
                  .map((c) => c.detail)
                  .join(", ") || "changed"
          return { value: p.name, label: p.name, hint }
        })

      if (multiOptions.length === 0) {
        log.warn(t("db.migrate.noChanges"))
        return
      }

      const result = await multiselect({
        message: t("db.migrate.selectPlugins"),
        options: multiOptions,
        initialValues: actionable.map((p) => p.name),
        cursorAt: multiOptions[0]?.value,
      })

      if (isCancel(result)) return

      const selectedNames = result as string[]
      selected = plugins.filter((p) => selectedNames.includes(p.name))

      if (selected.length === 0) return

      // UI: confirm before generating
      const shouldContinue = await confirm({ message: t("db.migrate.confirmGenerate") })
      if (isCancel(shouldContinue) || !shouldContinue) return
    }

    await migrationService.generateForPlugins(runner, selected, message)
  },
})
