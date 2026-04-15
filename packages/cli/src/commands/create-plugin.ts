import { defineCommand } from "citty"
import { text, confirm, isCancel, log, note } from "@clack/prompts"
import { t } from "../infra/i18n"
import { FluxError } from "../errors"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { MAIN_PY } from "../constants"

const PLUGINS_DIR = "apps/backend/plugins"

function toPackageName(name: string): string {
  return `rapidkit-plugin-${name}`
}

function toModuleName(name: string): string {
  return `plugin_${name}`
}

function generatePyprojectToml(name: string, description: string): string {
  const pkgName = toPackageName(name)
  const moduleName = toModuleName(name)
  return `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "${pkgName}"
version = "0.1.0"
description = "${description}"
requires-python = ">= 3.14"
dependencies = [
    "rapidkit-core",
    "rapidkit-common",
]

[tool.uv.sources]
rapidkit-core = { workspace = true }
rapidkit-common = { workspace = true }

[tool.hatch.build.targets.wheel]
include = ["src/"]
packages = ["src/${moduleName}"]
`
}

function generateInitPy(name: string): string {
  const moduleName = toModuleName(name)
  return `"""
${moduleName} plugin.

Author : TODO
Date   : ${new Date().toISOString().split("T")[0]}
"""

from rapidkit_core.plugin import PluginManifest


def register() -> PluginManifest:
    """Register the ${name} plugin."""
    from ${moduleName}.api import router

    return PluginManifest(
        name="${name}",
        version="0.1.0",
        router=router,
        models=[],
        dependencies=[],
    )
`
}

function generateApiPy(name: string): string {
  return `"""
${name} plugin API routes.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/${name}", tags=["${name}"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Health check for the ${name} plugin."""
    return {"status": "ok", "plugin": "${name}"}
`
}

function generateSchemasPy(): string {
  return `"""
Plugin schemas.
"""
`
}

function generateServicesPy(): string {
  return `"""
Plugin services.
"""
`
}

function generateCrudPy(): string {
  return `"""
Plugin CRUD operations.
"""
`
}

function generateTestRegister(name: string): string {
  const moduleName = toModuleName(name)
  return `"""${moduleName} register() tests."""

import unittest


class TestRegister(unittest.TestCase):

    def test_register_returns_manifest(self):
        from ${moduleName} import register

        m = register()
        assert m.name == "${name}"
        assert m.version == "0.1.0"

    def test_router_exists(self):
        from ${moduleName} import register

        m = register()
        assert m.router is not None
`
}

function generateTestConftest(): string {
  return `"""Plugin test conftest."""

import os

_ENV_DEFAULTS = {
    "POSTGRESQL_ASYNC_SCHEME": "postgresql+asyncpg",
    "POSTGRESQL_SYNC_SCHEME": "postgresql+psycopg",
    "POSTGRESQL_USERNAME": "test",
    "POSTGRESQL_PASSWORD": "test",
    "POSTGRESQL_HOST": "localhost",
    "POSTGRESQL_PORT": "5432",
    "POSTGRESQL_DATABASE": "test",
    "REDIS_ROOT_PASSWORD": "test",
    "REDIS_HOST": "localhost",
    "MINIO_ROOT_USER": "test",
    "MINIO_ROOT_PASSWORD": "test1234",
    "CORS_ORIGINS": '["*"]',
    "CORS_HEADERS": '["*"]',
    "ENVIRONMENT": "TESTING",
}

for key, value in _ENV_DEFAULTS.items():
    os.environ.setdefault(key, value)
`
}

function autoRegisterPlugin(cwd: string, name: string): void {
  const pkgName = `rapidkit-plugin-${name}`
  const moduleName = `plugin_${name}`

  // 1. Root pyproject.toml — add to dependencies and [tool.uv.sources]
  const rootPyproject = resolve(cwd, "pyproject.toml")
  let rootContent = readFileSync(rootPyproject, "utf-8")

  if (!rootContent.includes(`"${pkgName}"`)) {
    rootContent = rootContent.replace(/(dependencies\s*=\s*\[[\s\S]*?)(])/, (_, before, bracket) => {
      const trimmed = before.trimEnd()
      const needsComma = trimmed.endsWith('"') || trimmed.endsWith("}")
      return `${trimmed}${needsComma ? "," : ""}\n    "${pkgName}",\n${bracket}`
    })
  }

  if (!rootContent.includes(`${pkgName} =`)) {
    rootContent = rootContent.replace(
      /(\[tool\.uv\.sources\][\s\S]*?)(\n\n|\n\[)/,
      `$1${pkgName} = { workspace = true }\n$2`,
    )
  }

  writeFileSync(rootPyproject, rootContent, "utf-8")

  // 2. Backend pyproject.toml — same pattern
  const backendPyproject = resolve(cwd, "apps/backend/pyproject.toml")
  let backendContent = readFileSync(backendPyproject, "utf-8")

  if (!backendContent.includes(`"${pkgName}"`)) {
    backendContent = backendContent.replace(/(dependencies\s*=\s*\[[\s\S]*?)(])/, (_, before, bracket) => {
      const trimmed = before.trimEnd()
      const needsComma = trimmed.endsWith('"') || trimmed.endsWith("}")
      return `${trimmed}${needsComma ? "," : ""}\n    "${pkgName}",\n${bracket}`
    })
  }

  if (!backendContent.includes(`${pkgName} =`)) {
    backendContent = backendContent.replace(
      /(\[tool\.uv\.sources\][\s\S]*?)(\n\n|\n\[)/,
      `$1${pkgName} = { workspace = true }\n$2`,
    )
  }

  writeFileSync(backendPyproject, backendContent, "utf-8")

  // 3. main.py — add to PLUGIN_MODULES list
  const mainPyPath = resolve(cwd, MAIN_PY)
  let mainContent = readFileSync(mainPyPath, "utf-8")

  if (!mainContent.includes(`"${moduleName}"`)) {
    mainContent = mainContent.replace(/(PLUGIN_MODULES:\s*list\[str\]\s*=\s*\[[\s\S]*?)(])/, (_, before, bracket) => {
      const trimmed = before.trimEnd()
      const needsComma = trimmed.endsWith('"')
      return `${trimmed}${needsComma ? "," : ""}\n        "${moduleName}",\n    ${bracket}`
    })
  }

  writeFileSync(mainPyPath, mainContent, "utf-8")
}

export const createPlugin = defineCommand({
  meta: { name: "create-plugin", description: "Scaffold a new backend plugin" },
  args: {
    name: { type: "string", description: "Plugin name (e.g. notification)", required: false },
  },
  run: async ({ args }) => {
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

      if (isCancel(input)) {
        throw new FluxError("", "CANCELLED")
      }

      name = input as string
    }

    const descInput = await text({
      message: t("createPlugin.descPrompt"),
      placeholder: `The ${name} plugin`,
      defaultValue: `The ${name} plugin`,
    })

    if (isCancel(descInput)) {
      throw new FluxError("", "CANCELLED")
    }

    const description = (descInput as string) || `The ${name} plugin`
    const moduleName = toModuleName(name)
    const pluginDir = resolve(process.cwd(), PLUGINS_DIR, name)

    if (existsSync(pluginDir)) {
      log.error(t("createPlugin.alreadyExists", { name }))
      process.exit(1)
    }

    const shouldCreate = await confirm({
      message: t("createPlugin.confirm", { name, path: join(PLUGINS_DIR, name) }),
    })

    if (isCancel(shouldCreate) || !shouldCreate) {
      throw new FluxError("", "CANCELLED")
    }

    // Create directory structure
    const dirs = [
      join(pluginDir, "src", moduleName),
      join(pluginDir, "tests"),
      join(pluginDir, "migrations", "versions"),
    ]

    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true })
    }

    // Write files
    const files: [string, string][] = [
      [join(pluginDir, "pyproject.toml"), generatePyprojectToml(name, description)],
      [join(pluginDir, "src", moduleName, "__init__.py"), generateInitPy(name)],
      [join(pluginDir, "src", moduleName, "api.py"), generateApiPy(name)],
      [join(pluginDir, "src", moduleName, "schemas.py"), generateSchemasPy()],
      [join(pluginDir, "src", moduleName, "services.py"), generateServicesPy()],
      [join(pluginDir, "src", moduleName, "crud.py"), generateCrudPy()],
      [join(pluginDir, "tests", "conftest.py"), generateTestConftest()],
      [join(pluginDir, "tests", "test_register.py"), generateTestRegister(name)],
      [join(pluginDir, "migrations", "__init__.py"), ""],
      [join(pluginDir, "migrations", "versions", "__init__.py"), ""],
    ]

    for (const [filePath, content] of files) {
      writeFileSync(filePath, content, "utf-8")
    }

    // Auto-register plugin in pyproject.toml files and main.py
    autoRegisterPlugin(process.cwd(), name)

    note(
      [
        `${join(PLUGINS_DIR, name)}/`,
        `  pyproject.toml`,
        `  src/${moduleName}/`,
        `    __init__.py        # register()`,
        `    api.py             # routes`,
        `    schemas.py`,
        `    services.py`,
        `    crud.py`,
        `  tests/`,
        `    conftest.py`,
        `    test_register.py`,
        `  migrations/versions/`,
      ].join("\n"),
      t("createPlugin.created", { name }),
    )

    note(
      `${t("createPlugin.nextStep4")}\n\nrapidkit db migrate --plugin ${name} -m "init"`,
      t("createPlugin.nextSteps"),
    )
  },
})
