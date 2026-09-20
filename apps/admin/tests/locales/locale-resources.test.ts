import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

const localeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/locales")
const sourceRoot = resolve(localeRoot, "..")
const domains = ["common", "route", "request", "form", "datatable", "theme"]

function collectLeaves(value: unknown, prefix = ""): { leaves: Record<string, string>; invalidPaths: string[] } {
  if (typeof value === "string") return { leaves: { [prefix]: value }, invalidPaths: [] }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { leaves: {}, invalidPaths: [prefix] }

  const entries = Object.entries(value)
  if (!entries.length) return { leaves: {}, invalidPaths: [prefix] }
  return entries.reduce<{ leaves: Record<string, string>; invalidPaths: string[] }>(
    (result, [key, child]) => {
      const collected = collectLeaves(child, prefix ? `${prefix}.${key}` : key)
      return {
        leaves: { ...result.leaves, ...collected.leaves },
        invalidPaths: [...result.invalidPaths, ...collected.invalidPaths],
      }
    },
    { leaves: {}, invalidPaths: [] },
  )
}

const stringLiteralPattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g
const ariaDataValue = /(?:aria-(?:current|hidden|selected|checked)|data-[\w-]+)\s*=\s*$/
const developmentDiagnostic = /(?:console\.(?:debug|info|warn|error)|(?:throw\s+)?new Error)\s*\(\s*$/

function copyViolations(source: string): string[] {
  return Array.from(source.matchAll(stringLiteralPattern)).flatMap((match) => {
    const literal = match[0]
    if (!/[\u4e00-\u9fff]/.test(literal)) return []
    const preceding = source.slice(Math.max(0, (match.index ?? 0) - 100), match.index)
    if (ariaDataValue.test(preceding) || developmentDiagnostic.test(preceding)) return []
    const attribute = preceding.match(/(aria-[\w-]+|data-[\w-]+)\s*=\s*$/)?.[1]
    return [attribute ? `${attribute}=${literal}` : literal]
  })
}

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : []
  })
}

test("locale leaf collection reports non-string and empty object paths", () => {
  const result = collectLeaves({ valid: "copy", invalid: false, nested: { empty: {} }, list: ["copy"] })
  expect(result.invalidPaths).toEqual(["invalid", "nested.empty", "list"])
})

test("copy scanner exempts ARIA data values and diagnostics but not accessible labels", () => {
  expect(copyViolations('const state = <div aria-current="page" data-state="已选择" />')).toEqual([])
  expect(copyViolations('console.warn("开发诊断：已跳过")')).toEqual([])
  expect(copyViolations('<nav aria-label="主导航" />')).toEqual(['aria-label="主导航"'])
})

test("locale resources have symmetric non-empty Chinese and English leaves", () => {
  for (const domain of domains) {
    const zhPath = join(localeRoot, "zh-CN", `${domain}.json`)
    const enPath = join(localeRoot, "en-US", `${domain}.json`)
    expect(existsSync(zhPath), `missing Chinese ${domain} resource`).toBe(true)
    expect(existsSync(enPath), `missing English ${domain} resource`).toBe(true)
    if (!existsSync(zhPath) || !existsSync(enPath)) continue

    const zh = collectLeaves(JSON.parse(readFileSync(zhPath, "utf8")))
    const en = collectLeaves(JSON.parse(readFileSync(enPath, "utf8")))
    expect(zh.invalidPaths).toEqual([])
    expect(en.invalidPaths).toEqual([])
    expect(Object.keys(en.leaves).sort()).toEqual(Object.keys(zh.leaves).sort())
    expect(Object.values(zh.leaves).every((value) => value.trim().length > 0)).toBe(true)
    expect(Object.values(en.leaves).every((value) => value.trim().length > 0)).toBe(true)
    expect(Object.values(en.leaves).some((value) => /[\u4e00-\u9fff]/.test(value))).toBe(false)
  }
})

test("every seeded route i18n key exists in both admin locales", () => {
  const seedSource = readFileSync(resolve(localeRoot, "../../../backend/src/_menu_seeds.py"), "utf8")
  const keys = [...seedSource.matchAll(/i18n_key="([^"]+)"/g)].map((match) => match[1]).filter(Boolean)
  const enRoute = collectLeaves(JSON.parse(readFileSync(join(localeRoot, "en-US/route.json"), "utf8"))).leaves
  const zhRoute = collectLeaves(JSON.parse(readFileSync(join(localeRoot, "zh-CN/route.json"), "utf8"))).leaves

  for (const key of keys) {
    expect(enRoute[key]?.trim(), `missing English ${key}`).toBeTruthy()
    expect(zhRoute[key]?.trim(), `missing Chinese ${key}`).toBeTruthy()
  }
})

test("shared shell TSX files do not contain hardcoded Chinese copy", () => {
  const directories = [
    join(sourceRoot, "shared", "crud"),
    join(sourceRoot, "shared", "data-table"),
    join(sourceRoot, "features", "layout", "components"),
    join(sourceRoot, "features", "locale"),
    join(sourceRoot, "features", "theme", "components"),
    join(sourceRoot, "features", "router"),
    join(sourceRoot, "shared", "pages"),
  ]
  const violations = directories.flatMap((directory) =>
    tsxFiles(directory).flatMap((file) =>
      copyViolations(readFileSync(file, "utf8")).map((literal) => `${file.slice(sourceRoot.length + 1)}: ${literal}`),
    ),
  )
  expect(violations).toEqual([])
})
