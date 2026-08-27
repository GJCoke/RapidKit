import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// We need to mock getContext since plugin.service calls it
vi.mock("../../context", () => ({
  getContext: vi.fn(),
}))

import { getContext } from "../../context"
import { discoverPlugins, findPlugin } from "../../services/plugin.service"

function writePluginConfig(root: string, directoryName: string, name: string = directoryName) {
  const pluginRoot = join(root, "apps/backend/plugins", directoryName)
  mkdirSync(pluginRoot, { recursive: true })
  writeFileSync(
    join(pluginRoot, "pyproject.toml"),
    `[project.entry-points."rapidkit.plugins"]\n${name} = "plugin_${name}:register"\n`,
  )
}

describe("discoverPlugins", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-plugin-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    vi.mocked(getContext).mockReturnValue({
      runtime: "docker",
      region: "global",
      locale: "zh-CN",
      cwd: tempDir,
    })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("discovers plugins with migrations/versions directory", () => {
    // Create a plugin with migrations
    const pluginDir = join(tempDir, "apps/backend/plugins/auth/migrations/versions")
    mkdirSync(pluginDir, { recursive: true })
    writePluginConfig(tempDir, "auth")
    writeFileSync(join(pluginDir, "__init__.py"), "")
    writeFileSync(join(pluginDir, "abc123_init.py"), "# migration")

    const plugins = discoverPlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe("auth")
    expect(plugins[0].module).toBe("plugin_auth")
    expect(plugins[0].hasMigrations).toBe(true)
  })

  it("returns empty array when plugins dir doesn't exist", () => {
    const plugins = discoverPlugins()
    expect(plugins).toEqual([])
  })

  it("ignores directories without migrations/versions", () => {
    const pluginDir = join(tempDir, "apps/backend/plugins/auth/src")
    mkdirSync(pluginDir, { recursive: true })
    writePluginConfig(tempDir, "auth")

    const plugins = discoverPlugins()
    expect(plugins).toEqual([])
  })

  it("detects plugin without migration files as hasMigrations=false", () => {
    const pluginDir = join(tempDir, "apps/backend/plugins/menu/migrations/versions")
    mkdirSync(pluginDir, { recursive: true })
    writePluginConfig(tempDir, "menu")
    writeFileSync(join(pluginDir, "__init__.py"), "")

    const plugins = discoverPlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].hasMigrations).toBe(false)
  })

  it("uses the entry point identity for a hyphenated plugin directory", () => {
    const pluginRoot = join(tempDir, "apps/backend/plugins/gitlab-ci")
    const versionsDir = join(pluginRoot, "migrations/versions")
    mkdirSync(versionsDir, { recursive: true })
    writeFileSync(join(versionsDir, "__init__.py"), "")
    writeFileSync(
      join(pluginRoot, "pyproject.toml"),
      '[project.entry-points."rapidkit.plugins"]\ngitlab_ci = "plugin_gitlab_ci:register"\n',
    )

    const plugin = discoverPlugins().find(item => item.name === "gitlab_ci")

    expect(plugin).toEqual({
      name: "gitlab_ci",
      directoryName: "gitlab-ci",
      module: "plugin_gitlab_ci",
      versionPath: "plugins/gitlab-ci/migrations/versions",
      hasMigrations: false,
    })
    expect(findPlugin("gitlab-ci")).toEqual(plugin)
  })
})

describe("findPlugin", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-plugin-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    vi.mocked(getContext).mockReturnValue({
      runtime: "docker",
      region: "global",
      locale: "zh-CN",
      cwd: tempDir,
    })

    const pluginDir = join(tempDir, "apps/backend/plugins/auth/migrations/versions")
    mkdirSync(pluginDir, { recursive: true })
    writePluginConfig(tempDir, "auth")
    writeFileSync(join(pluginDir, "__init__.py"), "")
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("finds existing plugin by name", () => {
    const plugin = findPlugin("auth")
    expect(plugin).toBeDefined()
    expect(plugin!.name).toBe("auth")
  })

  it("returns undefined for non-existent plugin", () => {
    const plugin = findPlugin("nonexistent")
    expect(plugin).toBeUndefined()
  })
})
