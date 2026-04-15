import { describe, it, expect } from "vitest"
import {
  buildMigrateArgs,
  buildUpgradeArgs,
  buildDowngradeArgs,
  parseHeads,
  parseCurrent,
} from "../../services/alembic.service"
import type { Plugin } from "../../services/plugin.service"

describe("buildMigrateArgs", () => {
  const basePlugin: Plugin = {
    name: "auth",
    module: "plugin_auth",
    versionPath: "plugins/auth/migrations/versions",
    hasMigrations: true,
  }

  it("uses --head=<plugin>@head for existing migrations", () => {
    const args = buildMigrateArgs(basePlugin, "add user table")
    expect(args).toContain("--head=auth@head")
    expect(args).toContain("-m")
    expect(args).toContain("add user table")
    expect(args).toContain(`--version-path=${basePlugin.versionPath}`)
    expect(args).not.toContain("--branch-label=auth")
  })

  it("uses --branch-label + --head=base for initial migration", () => {
    const plugin = { ...basePlugin, hasMigrations: false }
    const args = buildMigrateArgs(plugin, "init")
    expect(args).toContain("--branch-label=auth")
    expect(args).toContain("--head=base")
    expect(args).not.toContain("--head=auth@head")
  })

  it("includes revision and autogenerate flags", () => {
    const args = buildMigrateArgs(basePlugin, "test")
    expect(args).toContain("revision")
    expect(args).toContain("--autogenerate")
  })
})

describe("buildUpgradeArgs", () => {
  it("upgrades to heads when no plugin specified", () => {
    const args = buildUpgradeArgs()
    expect(args).toEqual(["run", "alembic", "upgrade", "heads"])
  })

  it("targets specific plugin head", () => {
    const args = buildUpgradeArgs("auth")
    expect(args).toEqual(["run", "alembic", "upgrade", "auth@head"])
  })
})

describe("buildDowngradeArgs", () => {
  it("downgrades 1 step by default", () => {
    const args = buildDowngradeArgs("auth")
    expect(args).toEqual(["run", "alembic", "downgrade", "auth@-1"])
  })

  it("downgrades N steps", () => {
    const args = buildDowngradeArgs("auth", 3)
    expect(args).toEqual(["run", "alembic", "downgrade", "auth@-3"])
  })
})

describe("parseHeads", () => {
  it("parses multi-branch heads", () => {
    const output = ["a1b2c3d4e5f6 (auth) (head)", "f6e5d4c3b2a1 (menu) (head)"].join("\n")

    const heads = parseHeads(output)
    expect(heads.size).toBe(2)
    expect(heads.get("auth")).toBe("a1b2c3d4e5f6")
    expect(heads.get("menu")).toBe("f6e5d4c3b2a1")
  })

  it("parses main head without branch name", () => {
    const output = "abcdef123456 (head)"
    const heads = parseHeads(output)
    expect(heads.get("main")).toBe("abcdef123456")
  })

  it("returns empty map for empty output", () => {
    const heads = parseHeads("")
    expect(heads.size).toBe(0)
  })

  it("ignores non-matching lines", () => {
    const output = ["Some random text", "a1b2c3d4e5f6 (auth) (head)", "Another line"].join("\n")

    const heads = parseHeads(output)
    expect(heads.size).toBe(1)
  })
})

describe("parseCurrent", () => {
  it("parses current revisions", () => {
    const output = ["a1b2c3d4e5f6 (head)", "f6e5d4c3b2a1"].join("\n")

    const current = parseCurrent(output)
    expect(current.size).toBe(2)
    expect(current.has("a1b2c3d4e5f6")).toBe(true)
    expect(current.has("f6e5d4c3b2a1")).toBe(true)
  })

  it("returns empty set for empty output", () => {
    const current = parseCurrent("")
    expect(current.size).toBe(0)
  })
})
