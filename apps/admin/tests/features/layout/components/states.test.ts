import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const componentsUrl = new URL("../../../../src/features/layout/components/states/", import.meta.url)
const pagesUrl = new URL("../../../../src/shared/pages/", import.meta.url)
const localesUrl = new URL("../../../../src/locales/", import.meta.url)
const globalsUrl = new URL("../../../../src/styles/globals.css", import.meta.url)

async function readSource(base: URL, file: string) {
  return readFile(new URL(file, base), "utf8")
}

test("state components expose the planned APIs and semantic styling", async () => {
  const [loading, empty, error, barrel] = await Promise.all([
    readSource(componentsUrl, "loading-state.tsx"),
    readSource(componentsUrl, "empty-state.tsx"),
    readSource(componentsUrl, "error-state.tsx"),
    readSource(componentsUrl, "index.ts"),
  ])

  assert.match(loading, /export function LoadingState/)
  assert.match(loading, /min-h-64/)
  assert.match(loading, /animate-spin/)
  assert.match(empty, /export function EmptyState/)
  assert.match(empty, /action\?: ReactNode/)
  assert.match(error, /export function ErrorState/)
  assert.match(error, /text-destructive/)
  assert.match(error, /variant="outline"/)
  assert.match(barrel, /export \* from "\.\/loading-state"/)
  assert.match(barrel, /export \* from "\.\/empty-state"/)
  assert.match(barrel, /export \* from "\.\/error-state"/)
})

test("error pages use localized copy, semantic status styling, and HOME_PATH", async () => {
  const pages = await Promise.all(["403.tsx", "404.tsx", "500.tsx"].map((file) => readSource(pagesUrl, file)))

  const shared = await readSource(pagesUrl, "exception-page.tsx")
  for (const [index, page] of pages.entries()) {
    const status = ["403", "404", "500"][index]
    assert.match(page, new RegExp(`<ExceptionPage code="${status}"`))
    assert.match(page, /import \{ ExceptionPage \} from "\.\/exception-page"/)
    const source = shared
    assert.match(source, /useTranslation/)
    assert.match(source, /t\(`error\.\$\{code\}`\)/)
    assert.match(source, /t\("state\.backHome"\)/)
    assert.match(source, /text-7xl font-bold text-primary/)
    assert.match(source, /navigate\(HOME_PATH\)/)
    assert.match(source, /<Button/)
    assert.match(source, /className="flex h-full /)
    assert.doesNotMatch(source, /min-h-screen/)
  }
})

test("the application root provides a bounded height for full-height route pages", async () => {
  const source = await readFile(globalsUrl, "utf8")

  assert.match(source, /html,\s*body,\s*#app\s*\{[^}]*height:\s*100%/s)
  assert.doesNotMatch(source, /#root/)
})

test("both locales define state and error page messages", async () => {
  const localeFiles = await Promise.all([
    readSource(localesUrl, "en-US/common.json"),
    readSource(localesUrl, "zh-CN/common.json"),
  ])

  for (const source of localeFiles) {
    const locale = JSON.parse(source) as Record<string, Record<string, string>>
    assert.deepEqual(Object.keys(locale.state), ["loading", "empty", "error", "retry", "backHome"])
    assert.deepEqual(Object.keys(locale.error), ["403", "404", "500", "routeTitle", "routeDescription", "iframe"])
    assert.ok(Object.values(locale.state).every(Boolean))
    assert.ok(Object.values(locale.error).every(Boolean))
  }
})
