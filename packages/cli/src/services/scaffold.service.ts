import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface PluginFeatures {
  dependencies: string[]
  eventListeners: boolean
  healthCheck: boolean
  middleware: boolean
}

export interface ScaffoldOptions {
  name: string
  description: string
  features: PluginFeatures
}

export function toPackageName(name: string): string {
  return `rapidkit-plugin-${name}`
}

export function toModuleName(name: string): string {
  return `plugin_${name}`
}

function toPascalCase(name: string): string {
  return name
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")
}

export function generateInitPy(name: string, features: PluginFeatures): string {
  const moduleName = toModuleName(name)
  const pascal = toPascalCase(name)

  // Build imports
  const imports: string[] = []
  const pluginImports: string[] = ["PluginManifest"]

  if (features.middleware) {
    pluginImports.push("MiddlewareDef")
  }

  imports.push(`from rapidkit_core.plugin import ${pluginImports.join(", ")}`)

  if (features.eventListeners) {
    imports.push("")
    imports.push(`from ${moduleName}.events import ${pascal}Event, on_${name}_event`)
  }

  if (features.middleware) {
    imports.push(`from ${moduleName}.middleware import ${pascal}Middleware`)
  }

  // Build health check function
  let healthCheckDef = ""
  if (features.healthCheck) {
    healthCheckDef = `

async def check_health() -> dict:
    """插件健康检查。"""
    return {"status": "healthy"}
`
  }

  // Build PluginManifest fields
  const deps = features.dependencies.length > 0 ? `[${features.dependencies.map((d) => `"${d}"`).join(", ")}]` : "[]"

  const fields: string[] = [
    `        name="${name}",`,
    `        version="0.1.0",`,
    `        router=router,`,
    `        models=[],`,
    `        dependencies=${deps},`,
  ]

  if (features.eventListeners) {
    fields.push(`        event_listeners=[`)
    fields.push(`            (${pascal}Event, on_${name}_event),`)
    fields.push(`        ],`)
  }

  if (features.healthCheck) {
    fields.push(`        health_check=check_health,`)
  }

  if (features.middleware) {
    fields.push(`        middlewares=[`)
    fields.push(`            MiddlewareDef(cls=${pascal}Middleware, kwargs={}, order=0),`)
    fields.push(`        ],`)
  }

  return `"""
${moduleName} plugin.

Author : TODO
Date   : ${new Date().toISOString().split("T")[0]}
"""

${imports.join("\n")}
${healthCheckDef}

def register() -> PluginManifest:
    """Register the ${name} plugin."""
    from ${moduleName}.api import router

    return PluginManifest(
${fields.join("\n")}
    )
`
}

export function generateEventsPy(name: string): string {
  const pascal = toPascalCase(name)
  return `"""
${toModuleName(name)} events.
"""

from rapidkit_core.events import Event


class ${pascal}Event(Event):
    """示例事件，请根据业务需求修改。"""

    pass


def on_${name}_event(event: ${pascal}Event) -> None:
    """示例事件处理器。"""
    pass
`
}

export function generateMiddlewarePy(name: string): string {
  const pascal = toPascalCase(name)
  return `"""
${toModuleName(name)} middleware.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class ${pascal}Middleware(BaseHTTPMiddleware):
    """示例中间件，请根据业务需求修改。"""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        return response
`
}

export function generateApiPy(name: string): string {
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

function generateStubPy(docstring: string): string {
  return `"""
${docstring}
"""
`
}

export const generateSchemasPy = () => generateStubPy("Plugin schemas.")
export const generateServicesPy = () => generateStubPy("Plugin services.")
export const generateCrudPy = () => generateStubPy("Plugin CRUD operations.")

export function generateTestConftest(): string {
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

export function generateTestRegister(name: string, features: PluginFeatures): string {
  const moduleName = toModuleName(name)
  const pascal = toPascalCase(name)

  // Build allowed set for cross-plugin import check
  const allowedPlugins = [`"${moduleName}"`]
  for (const dep of features.dependencies) {
    allowedPlugins.push(`"plugin_${dep}"`)
  }
  const allowedSet = `{${allowedPlugins.join(", ")}}`

  // Build conditional tests
  const conditionalTests: string[] = []

  if (features.healthCheck) {
    conditionalTests.push(`
    def test_health_check_exists(self):
        from ${moduleName} import register

        m = register()
        assert m.health_check is not None`)
  }

  if (features.eventListeners) {
    conditionalTests.push(`
    def test_event_listeners_registered(self):
        from ${moduleName} import register

        m = register()
        assert len(m.event_listeners) > 0`)
  }

  if (features.middleware) {
    conditionalTests.push(`
    def test_middlewares_registered(self):
        from ${moduleName} import register

        m = register()
        assert len(m.middlewares) > 0`)
  }

  return `"""${moduleName} register() tests."""

import ast
import unittest
from pathlib import Path


class Test${pascal}Register(unittest.TestCase):
    def test_register_returns_manifest(self):
        from ${moduleName} import register

        m = register()
        assert m.name == "${name}"
        assert m.version == "0.1.0"

    def test_router_exists(self):
        from ${moduleName} import register

        m = register()
        assert m.router is not None

    def test_router_has_health_route(self):
        from ${moduleName} import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/${name}/health" in routes
${conditionalTests.join("\n")}

    def test_no_cross_plugin_imports(self):
        """只允许导入已声明依赖的插件。"""
        allowed = ${allowedSet}
        plugin_src = Path(__file__).resolve().parent.parent / "src" / "${moduleName}"
        violations = []
        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    top = node.module.split(".")[0]
                    if top.startswith("plugin_") and top not in allowed:
                        violations.append(f"{py_file.name}: {node.module}")
        assert violations == [], f"Cross-plugin imports: {violations}"
`
}

export function scaffoldPlugin(pluginDir: string, opts: ScaffoldOptions): void {
  const { name, description, features } = opts
  const moduleName = toModuleName(name)

  // Create directories
  const dirs = [join(pluginDir, "src", moduleName), join(pluginDir, "tests"), join(pluginDir, "migrations", "versions")]

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true })
  }

  // Collect files to write
  const files: [string, string][] = [
    [join(pluginDir, "pyproject.toml"), generatePyprojectToml(name, description)],
    [join(pluginDir, "src", moduleName, "__init__.py"), generateInitPy(name, features)],
    [join(pluginDir, "src", moduleName, "api.py"), generateApiPy(name)],
    [join(pluginDir, "src", moduleName, "schemas.py"), generateSchemasPy()],
    [join(pluginDir, "src", moduleName, "services.py"), generateServicesPy()],
    [join(pluginDir, "src", moduleName, "crud.py"), generateCrudPy()],
    [join(pluginDir, "tests", "__init__.py"), ""],
    [join(pluginDir, "tests", "conftest.py"), generateTestConftest()],
    [join(pluginDir, "tests", "test_register.py"), generateTestRegister(name, features)],
    [join(pluginDir, "migrations", "__init__.py"), ""],
    [join(pluginDir, "migrations", "versions", "__init__.py"), ""],
  ]

  // Conditional files
  if (features.eventListeners) {
    files.push([join(pluginDir, "src", moduleName, "events.py"), generateEventsPy(name)])
  }

  if (features.middleware) {
    files.push([join(pluginDir, "src", moduleName, "middleware.py"), generateMiddlewarePy(name)])
  }

  for (const [filePath, content] of files) {
    writeFileSync(filePath, content, "utf-8")
  }
}

export function generatePyprojectToml(name: string, description: string): string {
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

[project.entry-points."rapidkit.plugins"]
${name} = "${moduleName}:register"

[tool.hatch.build.targets.wheel]
packages = ["src/${moduleName}"]

[tool.pytest.ini_options]
pythonpath = ["src"]
`
}
