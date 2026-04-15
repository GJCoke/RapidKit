import { defineCommand } from "citty"
import { confirm, password, isCancel } from "@clack/prompts"
import { resolve } from "node:path"
import { readdirSync, unlinkSync } from "node:fs"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { buildComposeCommand } from "../../core/compose"
import { readDbCredentials } from "../../core/database"
import { buildMigrateArgs, buildUpgradeArgs } from "../../core/alembic"
import { syncAlembicConfig, discoverPlugins } from "../../core/plugins"
import { BACKEND_DIR, DEV_COMPOSE, MIGRATION_DIR } from "../../constants"

const PLUGIN_TOPO_ORDER = ["auth", "user", "script", "monitoring", "schedule", "worker", "menu", "system"]

export const reset = defineCommand({
  meta: { name: "reset", description: "Reset database" },
  args: {
    split: { type: "boolean", description: "Split into per-plugin migrations", required: false },
  },
  run: async ({ args }) => {
    const ctx = getContext()

    const confirmMsg = args.split ? t("db.reset.splitConfirm") : t("db.reset.confirm")
    const shouldReset = await confirm({ message: confirmMsg })
    if (isCancel(shouldReset) || !shouldReset) return

    const confirmAgain = await confirm({ message: t("db.reset.doubleConfirm") })
    if (isCancel(confirmAgain) || !confirmAgain) return

    const runner = createTaskRunner({ title: t("db.reset.title"), ctx })
    const backendDir = resolve(ctx.cwd, BACKEND_DIR)

    runner.exec({ label: t("db.reset.cleanMigrations") }, () => {
      const mainVersionsDir = resolve(ctx.cwd, MIGRATION_DIR)
      for (const file of readdirSync(mainVersionsDir)) {
        if (file.endsWith(".py") && file !== "__init__.py") {
          unlinkSync(resolve(mainVersionsDir, file))
        }
      }

      const plugins = discoverPlugins()
      for (const plugin of plugins) {
        const pluginVersionsDir = resolve(backendDir, plugin.versionPath)
        for (const file of readdirSync(pluginVersionsDir)) {
          if (file.endsWith(".py") && file !== "__init__.py") {
            unlinkSync(resolve(pluginVersionsDir, file))
          }
        }
      }
    })

    const envPath = resolve(ctx.cwd, BACKEND_DIR, ".env")
    const creds = readDbCredentials(envPath)

    let finalPassword = creds.password
    if (!finalPassword) {
      const input = await password({ message: t("db.reset.password") })
      if (isCancel(input)) return
      finalPassword = input
    }

    const dropCmd = buildComposeCommand(ctx, DEV_COMPOSE, [
      "exec",
      "-T",
      "-e",
      `PGPASSWORD=${finalPassword}`,
      "postgresql",
      "psql",
      "-U",
      creds.user,
      "-d",
      creds.database,
      "-c",
      "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    ])
    await runner.run({ label: t("db.reset.dropSchema") }, dropCmd.cmd, dropCmd.args)

    runner.exec({ label: t("db.migrate.syncing") }, () => {
      syncAlembicConfig()
    })

    if (args.split) {
      const plugins = discoverPlugins()
      const pluginMap = new Map(plugins.map((p) => [p.name, p]))

      for (const pluginName of PLUGIN_TOPO_ORDER) {
        const plugin = pluginMap.get(pluginName)
        if (!plugin) continue

        const freshPlugin = { ...plugin, hasMigrations: false }
        const migrateArgs = buildMigrateArgs(freshPlugin, "init")

        await runner.run(
          { label: t("db.reset.generatingPlugin", { plugin: pluginName }), cwd: backendDir },
          "uv",
          migrateArgs,
        )
      }

      await runner.run({ label: t("db.upgrade.running"), cwd: backendDir }, "uv", buildUpgradeArgs())
    } else {
      await runner.run({ label: t("db.generating"), cwd: backendDir }, "uv", [
        "run",
        "alembic",
        "revision",
        "--autogenerate",
        "-m",
        "init",
        "--version-path",
        "alembic/versions",
      ])

      await runner.run({ label: t("db.migrating"), cwd: backendDir }, "uv", ["run", "alembic", "upgrade", "head"])
    }

    const shouldSeed = await confirm({ message: t("db.reset.rebuild") })
    if (!isCancel(shouldSeed) && shouldSeed) {
      await runner.run({ label: t("db.seeding"), cwd: backendDir }, "uv", ["run", "python", "src/initdb.py"])
    }

    runner.done()
  },
})
