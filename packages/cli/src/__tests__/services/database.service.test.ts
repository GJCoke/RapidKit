import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

vi.mock("../../context", () => ({
  getContext: vi.fn(),
}))

import { getContext } from "../../context"
import { getMigrationFileStats, cleanPluginMigrationFiles } from "../../services/database.service"

describe("getMigrationFileStats", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-db-test-${Date.now()}`)
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

  it("returns stats for plugins with migration files", () => {
    const authDir = join(tempDir, "apps/backend/plugins/auth/migrations/versions")
    mkdirSync(authDir, { recursive: true })
    writeFileSync(join(authDir, "__init__.py"), "")
    writeFileSync(join(authDir, "abc123_init.py"), "# migration")
    writeFileSync(join(authDir, "def456_add_col.py"), "# migration")

    const stats = getMigrationFileStats()
    expect(stats).toHaveLength(1)
    expect(stats[0]).toEqual({
      plugin: "auth",
      dir: authDir,
      count: 2,
    })
  })

  it("excludes plugins with only __init__.py", () => {
    const menuDir = join(tempDir, "apps/backend/plugins/menu/migrations/versions")
    mkdirSync(menuDir, { recursive: true })
    writeFileSync(join(menuDir, "__init__.py"), "")

    const stats = getMigrationFileStats()
    expect(stats).toHaveLength(0)
  })

  it("includes main alembic/versions directory", () => {
    const mainDir = join(tempDir, "apps/backend/alembic/versions")
    mkdirSync(mainDir, { recursive: true })
    writeFileSync(join(mainDir, "__init__.py"), "")
    writeFileSync(join(mainDir, "abc_main.py"), "# migration")

    const stats = getMigrationFileStats()
    expect(stats).toHaveLength(1)
    expect(stats[0].plugin).toBe("alembic")
  })

  it("returns empty array when no migration files exist", () => {
    const stats = getMigrationFileStats()
    expect(stats).toEqual([])
  })
})

describe("cleanPluginMigrationFiles", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-db-test-${Date.now()}`)
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

  it("deletes .py files and preserves __init__.py", () => {
    const authDir = join(tempDir, "apps/backend/plugins/auth/migrations/versions")
    mkdirSync(authDir, { recursive: true })
    writeFileSync(join(authDir, "__init__.py"), "")
    writeFileSync(join(authDir, "abc123_init.py"), "# migration")
    writeFileSync(join(authDir, "def456_add_col.py"), "# migration")

    const deleted = cleanPluginMigrationFiles("auth")
    expect(deleted).toBe(2)

    const remaining = readdirSync(authDir)
    expect(remaining).toEqual(["__init__.py"])
  })

  it("returns 0 for plugin with no migration files", () => {
    const menuDir = join(tempDir, "apps/backend/plugins/menu/migrations/versions")
    mkdirSync(menuDir, { recursive: true })
    writeFileSync(join(menuDir, "__init__.py"), "")

    const deleted = cleanPluginMigrationFiles("menu")
    expect(deleted).toBe(0)
  })

  it("returns 0 for non-existent plugin", () => {
    const deleted = cleanPluginMigrationFiles("nonexistent")
    expect(deleted).toBe(0)
  })

  it("cleans alembic main directory when plugin is 'alembic'", () => {
    const mainDir = join(tempDir, "apps/backend/alembic/versions")
    mkdirSync(mainDir, { recursive: true })
    writeFileSync(join(mainDir, "__init__.py"), "")
    writeFileSync(join(mainDir, "abc_main.py"), "# migration")

    const deleted = cleanPluginMigrationFiles("alembic")
    expect(deleted).toBe(1)
  })
})
