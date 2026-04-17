import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  toPackageName,
  toModuleName,
  generatePyprojectToml,
  generateInitPy,
  generateEventsPy,
  generateMiddlewarePy,
  generateApiPy,
  generateTestRegister,
  scaffoldPlugin,
  type PluginFeatures,
  type ScaffoldOptions,
} from "../../services/scaffold.service"

describe("toPackageName", () => {
  it("converts plugin name to package name", () => {
    expect(toPackageName("notification")).toBe("rapidkit-plugin-notification")
  })

  it("handles underscored names", () => {
    expect(toPackageName("my_plugin")).toBe("rapidkit-plugin-my_plugin")
  })
})

describe("toModuleName", () => {
  it("converts plugin name to module name", () => {
    expect(toModuleName("notification")).toBe("plugin_notification")
  })
})

describe("generatePyprojectToml", () => {
  it("includes entry-points section", () => {
    const result = generatePyprojectToml("foo", "The foo plugin")
    expect(result).toContain('[project.entry-points."rapidkit.plugins"]')
    expect(result).toContain('foo = "plugin_foo:register"')
  })

  it("includes pytest config", () => {
    const result = generatePyprojectToml("foo", "The foo plugin")
    expect(result).toContain("[tool.pytest.ini_options]")
    expect(result).toContain('pythonpath = ["src"]')
  })

  it("includes hatchling build system", () => {
    const result = generatePyprojectToml("foo", "The foo plugin")
    expect(result).toContain('build-backend = "hatchling.build"')
  })

  it("uses correct package and module names", () => {
    const result = generatePyprojectToml("notification", "Notify users")
    expect(result).toContain('name = "rapidkit-plugin-notification"')
    expect(result).toContain('packages = ["src/plugin_notification"]')
    expect(result).toContain('notification = "plugin_notification:register"')
  })
})

describe("generateInitPy", () => {
  const minimal: PluginFeatures = {
    dependencies: [],
    eventListeners: false,
    healthCheck: false,
    middleware: false,
  }

  it("generates minimal register() with no features", () => {
    const result = generateInitPy("foo", minimal)
    expect(result).toContain("from rapidkit_core.plugin import PluginManifest")
    expect(result).toContain('name="foo"')
    expect(result).toContain("dependencies=[]")
    expect(result).not.toContain("event_listeners")
    expect(result).not.toContain("health_check")
    expect(result).not.toContain("middlewares")
  })

  it("includes dependencies when specified", () => {
    const features: PluginFeatures = { ...minimal, dependencies: ["auth", "system"] }
    const result = generateInitPy("foo", features)
    expect(result).toContain('dependencies=["auth", "system"]')
  })

  it("includes event_listeners when enabled", () => {
    const features: PluginFeatures = { ...minimal, eventListeners: true }
    const result = generateInitPy("foo", features)
    expect(result).toContain("event_listeners")
    expect(result).toContain("from plugin_foo.events import FooEvent, on_foo_event")
  })

  it("includes health_check when enabled", () => {
    const features: PluginFeatures = { ...minimal, healthCheck: true }
    const result = generateInitPy("foo", features)
    expect(result).toContain("health_check=check_health")
    expect(result).toContain("async def check_health()")
  })

  it("includes middlewares when enabled", () => {
    const features: PluginFeatures = { ...minimal, middleware: true }
    const result = generateInitPy("foo", features)
    expect(result).toContain("middlewares")
    expect(result).toContain("MiddlewareDef")
    expect(result).toContain("from plugin_foo.middleware import FooMiddleware")
  })

  it("includes all features together", () => {
    const features: PluginFeatures = {
      dependencies: ["auth"],
      eventListeners: true,
      healthCheck: true,
      middleware: true,
    }
    const result = generateInitPy("foo", features)
    expect(result).toContain("event_listeners")
    expect(result).toContain("health_check")
    expect(result).toContain("middlewares")
    expect(result).toContain('dependencies=["auth"]')
  })
})

describe("generateEventsPy", () => {
  it("generates event class and handler", () => {
    const result = generateEventsPy("foo")
    expect(result).toContain("from rapidkit_core.events import Event")
    expect(result).toContain("class FooEvent(Event)")
    expect(result).toContain("def on_foo_event(event: FooEvent)")
  })

  it("handles underscored names", () => {
    const result = generateEventsPy("my_plugin")
    expect(result).toContain("class MyPluginEvent(Event)")
    expect(result).toContain("def on_my_plugin_event(event: MyPluginEvent)")
  })
})

describe("generateMiddlewarePy", () => {
  it("generates middleware class", () => {
    const result = generateMiddlewarePy("foo")
    expect(result).toContain("class FooMiddleware(BaseHTTPMiddleware)")
    expect(result).toContain("async def dispatch")
  })
})

describe("generateApiPy", () => {
  it("generates router with health endpoint", () => {
    const result = generateApiPy("foo")
    expect(result).toContain('prefix="/foo"')
    expect(result).toContain('tags=["foo"]')
    expect(result).toContain("async def health()")
  })
})

describe("generateTestRegister", () => {
  const minimal: PluginFeatures = {
    dependencies: [],
    eventListeners: false,
    healthCheck: false,
    middleware: false,
  }

  it("always includes cross-plugin import check", () => {
    const result = generateTestRegister("foo", minimal)
    expect(result).toContain("test_no_cross_plugin_imports")
    expect(result).toContain('"plugin_foo"')
  })

  it("includes dependency plugins in allowed set", () => {
    const features: PluginFeatures = { ...minimal, dependencies: ["auth", "system"] }
    const result = generateTestRegister("foo", features)
    expect(result).toContain('"plugin_auth"')
    expect(result).toContain('"plugin_system"')
  })

  it("includes health_check test when enabled", () => {
    const features: PluginFeatures = { ...minimal, healthCheck: true }
    const result = generateTestRegister("foo", features)
    expect(result).toContain("test_health_check_exists")
  })

  it("includes event_listeners test when enabled", () => {
    const features: PluginFeatures = { ...minimal, eventListeners: true }
    const result = generateTestRegister("foo", features)
    expect(result).toContain("test_event_listeners_registered")
  })

  it("includes middlewares test when enabled", () => {
    const features: PluginFeatures = { ...minimal, middleware: true }
    const result = generateTestRegister("foo", features)
    expect(result).toContain("test_middlewares_registered")
  })
})

describe("scaffoldPlugin", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-scaffold-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("creates minimal plugin structure", () => {
    const opts: ScaffoldOptions = {
      name: "foo",
      description: "The foo plugin",
      features: { dependencies: [], eventListeners: false, healthCheck: false, middleware: false },
    }
    scaffoldPlugin(tempDir, opts)

    expect(existsSync(join(tempDir, "pyproject.toml"))).toBe(true)
    expect(existsSync(join(tempDir, "src/plugin_foo/__init__.py"))).toBe(true)
    expect(existsSync(join(tempDir, "src/plugin_foo/api.py"))).toBe(true)
    expect(existsSync(join(tempDir, "src/plugin_foo/schemas.py"))).toBe(true)
    expect(existsSync(join(tempDir, "src/plugin_foo/services.py"))).toBe(true)
    expect(existsSync(join(tempDir, "src/plugin_foo/crud.py"))).toBe(true)
    expect(existsSync(join(tempDir, "tests/__init__.py"))).toBe(true)
    expect(existsSync(join(tempDir, "tests/conftest.py"))).toBe(true)
    expect(existsSync(join(tempDir, "tests/test_register.py"))).toBe(true)
    expect(existsSync(join(tempDir, "migrations/__init__.py"))).toBe(true)
    expect(existsSync(join(tempDir, "migrations/versions/__init__.py"))).toBe(true)

    // Should NOT have events.py or middleware.py
    expect(existsSync(join(tempDir, "src/plugin_foo/events.py"))).toBe(false)
    expect(existsSync(join(tempDir, "src/plugin_foo/middleware.py"))).toBe(false)

    // pyproject.toml should have entry-points
    const pyproject = readFileSync(join(tempDir, "pyproject.toml"), "utf-8")
    expect(pyproject).toContain('[project.entry-points."rapidkit.plugins"]')
  })

  it("creates events.py when eventListeners enabled", () => {
    const opts: ScaffoldOptions = {
      name: "foo",
      description: "The foo plugin",
      features: { dependencies: [], eventListeners: true, healthCheck: false, middleware: false },
    }
    scaffoldPlugin(tempDir, opts)

    expect(existsSync(join(tempDir, "src/plugin_foo/events.py"))).toBe(true)
    const initPy = readFileSync(join(tempDir, "src/plugin_foo/__init__.py"), "utf-8")
    expect(initPy).toContain("event_listeners")
  })

  it("creates middleware.py when middleware enabled", () => {
    const opts: ScaffoldOptions = {
      name: "foo",
      description: "The foo plugin",
      features: { dependencies: [], eventListeners: false, healthCheck: false, middleware: true },
    }
    scaffoldPlugin(tempDir, opts)

    expect(existsSync(join(tempDir, "src/plugin_foo/middleware.py"))).toBe(true)
    const initPy = readFileSync(join(tempDir, "src/plugin_foo/__init__.py"), "utf-8")
    expect(initPy).toContain("MiddlewareDef")
  })
})
