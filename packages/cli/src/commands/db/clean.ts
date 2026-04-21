import { confirm, multiselect, isCancel, log } from "@clack/prompts"
import { t } from "../../infra/i18n"
import { getMigrationFileStats, cleanPluginMigrationFiles } from "../../services/database.service"
import { defineFluxCommand } from "../_shared"

export const clean = defineFluxCommand({
  meta: { description: t("db.clean.title") },
  args: {
    plugin: { type: "string", description: "Plugin name", required: false },
    all: { type: "boolean", description: "Clean all plugins (non-interactive)", required: false },
  },
  async run({ runner, args }) {
    const stats = getMigrationFileStats()

    if (stats.length === 0) {
      log.warn(t("db.clean.noFiles"))
      return
    }

    // Single plugin mode
    if (args.plugin) {
      const pluginName = args.plugin as string
      const found = stats.find((s) => s.plugin === pluginName)
      if (!found) {
        log.error(t("db.clean.pluginNotFound", { plugin: pluginName }))
        return
      }

      const shouldProceed = await confirm({ message: t("db.clean.confirm") })
      if (isCancel(shouldProceed) || !shouldProceed) return

      runner.exec({ label: t("db.clean.cleaning", { plugin: pluginName }) }, () => {
        const deleted = cleanPluginMigrationFiles(pluginName)
        log.info(t("db.clean.done", { count: String(deleted) }))
      })
      return
    }

    // All mode
    if (args.all) {
      const totalFiles = stats.reduce((sum, s) => sum + s.count, 0)
      const shouldProceed = await confirm({
        message: t("db.clean.confirmAll", { count: String(totalFiles) }),
      })
      if (isCancel(shouldProceed) || !shouldProceed) return

      for (const s of stats) {
        runner.exec({ label: t("db.clean.cleaning", { plugin: s.plugin }) }, () => {
          cleanPluginMigrationFiles(s.plugin)
        })
      }
      log.info(t("db.clean.done", { count: String(totalFiles) }))
      return
    }

    // Interactive mode
    const options = stats.map((s) => ({
      value: s.plugin,
      label: s.plugin,
      hint: `${s.count} file(s)`,
    }))

    const selected = await multiselect({
      message: t("db.clean.selectPlugins"),
      options,
      initialValues: [],
    })

    if (isCancel(selected)) return

    const selectedNames = selected as string[]
    if (selectedNames.length === 0) return

    const shouldProceed = await confirm({ message: t("db.clean.confirm") })
    if (isCancel(shouldProceed) || !shouldProceed) return

    let totalDeleted = 0
    for (const name of selectedNames) {
      runner.exec({ label: t("db.clean.cleaning", { plugin: name }) }, () => {
        totalDeleted += cleanPluginMigrationFiles(name)
      })
    }
    log.info(t("db.clean.done", { count: String(totalDeleted) }))
  },
})
