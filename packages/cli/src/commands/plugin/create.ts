import { defineCommand } from "citty"
import { text, confirm, multiselect, isCancel, log, note } from "@clack/prompts"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { t } from "../../infra/i18n"
import { FluxError } from "../../errors"
import { toPackageName, toModuleName, scaffoldPlugin, type PluginFeatures } from "../../services/scaffold.service"
import { syncAlembicConfig } from "../../services/plugin.service"

const PLUGINS_DIR = "apps/backend/plugins"

function autoRegisterPyproject(cwd: string, name: string): void {
  const pkgName = toPackageName(name)

  for (const relPath of ["pyproject.toml", "apps/backend/pyproject.toml"]) {
    const filePath = resolve(cwd, relPath)
    let content = readFileSync(filePath, "utf-8")

    if (!content.includes(`"${pkgName}"`)) {
      content = content.replace(/(dependencies\s*=\s*\[[\s\S]*?)(^\])/m, (_, before, bracket) => {
        const trimmed = before.trimEnd()
        const needsComma = trimmed.endsWith('"') || trimmed.endsWith("}")
        return `${trimmed}${needsComma ? "," : ""}\n    "${pkgName}",\n${bracket}`
      })
    }

    if (!content.includes(`${pkgName} =`)) {
      content = content.replace(/(\[tool\.uv\.sources\][\s\S]*?)(\n\n|\n\[)/, `$1\n${pkgName} = { workspace = true }$2`)
    }

    writeFileSync(filePath, content, "utf-8")
  }
}

export const create = defineCommand({
  meta: { name: "create", description: t("plugin.create.description") },
  args: {
    name: { type: "string", description: "Plugin name (e.g. notification)", required: false },
  },
  run: async ({ args }) => {
    // 1. Plugin name
    let name = args.name

    if (!name) {
      const input = await text({
        message: t("createPlugin.namePrompt"),
        placeholder: "notification",
        validate: (val) => {
          if (!val || val.trim().length === 0) return t("createPlugin.nameRequired")
          if (!/^[a-z][a-z0-9_]*$/.test(val)) return t("createPlugin.nameInvalid")
          return undefined
        },
      })

      if (isCancel(input)) throw new FluxError("", "CANCELLED")
      name = input as string
    }

    // 2. Description
    const descInput = await text({
      message: t("createPlugin.descPrompt"),
      placeholder: `The ${name} plugin`,
      defaultValue: `The ${name} plugin`,
    })

    if (isCancel(descInput)) throw new FluxError("", "CANCELLED")
    const description = (descInput as string) || `The ${name} plugin`

    // 3. Feature selection
    const featureSelection = await multiselect({
      message: t("createPlugin.featuresPrompt"),
      options: [
        { value: "deps", label: t("createPlugin.featureDeps") },
        { value: "events", label: t("createPlugin.featureEvents") },
        { value: "middleware", label: t("createPlugin.featureMiddleware") },
      ],
      required: false,
    })

    if (isCancel(featureSelection)) throw new FluxError("", "CANCELLED")
    const selected = featureSelection as string[]

    // 4. Dependencies input (if selected)
    const features: PluginFeatures = {
      dependencies: [],
      eventListeners: selected.includes("events"),
      middleware: selected.includes("middleware"),
    }

    if (selected.includes("deps")) {
      const depsInput = await text({
        message: t("createPlugin.depsPrompt"),
        placeholder: "auth,system",
        validate: (val) => {
          if (!val || val.trim().length === 0) return undefined
          const names = val.split(",").map((s) => s.trim())
          for (const n of names) {
            if (!/^[a-z][a-z0-9_]*$/.test(n)) return t("createPlugin.depsInvalid")
          }
          return undefined
        },
      })

      if (isCancel(depsInput)) throw new FluxError("", "CANCELLED")
      if (depsInput) {
        features.dependencies = (depsInput as string)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      }
    }

    // 5. Check existence
    const pluginDir = resolve(process.cwd(), PLUGINS_DIR, name)

    if (existsSync(pluginDir)) {
      log.error(t("createPlugin.alreadyExists", { name }))
      process.exit(1)
    }

    // 6. Confirm
    const shouldCreate = await confirm({
      message: t("createPlugin.confirm", { name, path: join(PLUGINS_DIR, name) }),
    })

    if (isCancel(shouldCreate) || !shouldCreate) throw new FluxError("", "CANCELLED")

    // 7. Scaffold
    scaffoldPlugin(pluginDir, { name, description, features })

    // 8. Auto-register
    autoRegisterPyproject(process.cwd(), name)
    syncAlembicConfig(process.cwd())

    // 9. Summary
    const moduleName = toModuleName(name)
    const tree = [
      `${join(PLUGINS_DIR, name)}/`,
      `  pyproject.toml`,
      `  src/${moduleName}/`,
      `    __init__.py        # register()`,
      `    api.py             # routes`,
    ]

    if (features.eventListeners) tree.push(`    events.py          # EventBus`)
    if (features.middleware) tree.push(`    middleware.py      # Middleware`)

    tree.push(
      `    schemas.py`,
      `    services.py`,
      `    crud.py`,
      `  tests/`,
      `    __init__.py`,
      `    conftest.py`,
      `    test_register.py`,
      `  migrations/versions/`,
    )

    note(tree.join("\n"), t("createPlugin.created", { name }))

    note(
      [
        `${t("createPlugin.autoRegistered")}:`,
        `  ✔ ${t("createPlugin.registeredPyproject")}`,
        `  ✔ ${t("createPlugin.registeredAlembic")}`,
        "",
        `${t("createPlugin.nextSteps")}:`,
        `  1. ${t("createPlugin.nextStep1")}`,
        `  2. ${t("createPlugin.nextStep2", { name })}`,
        `  3. ${t("createPlugin.nextStep3", { name })}`,
      ].join("\n"),
      t("createPlugin.nextSteps"),
    )
  },
})
