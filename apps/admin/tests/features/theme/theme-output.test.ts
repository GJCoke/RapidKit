import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { defaultThemeConfig } from "@/features/theme/theme-config"
import { formatThemeConfigAsJson, formatThemeConfigAsTypeScript } from "@/features/theme/theme-output"
import { getThemeRootState } from "@/features/theme/theme-resolver"

const css = await readFile(new URL("../../../src/styles/globals.css", import.meta.url), "utf8")

test("TypeScript output is paste-ready and stable", () => {
  const first = formatThemeConfigAsTypeScript(defaultThemeConfig)
  const second = formatThemeConfigAsTypeScript(structuredClone(defaultThemeConfig))
  expect(first).toBe(second)
  expect(first).toContain("export const defaultThemeConfig")
  expect(first).toContain("satisfies AdminThemeConfig")
})

test("JSON output is stable and contains generated tokens", () => {
  const first = formatThemeConfigAsJson(defaultThemeConfig)
  expect(first).toBe(formatThemeConfigAsJson(defaultThemeConfig))
  expect(JSON.parse(first).tokens.light.primary).toBe(defaultThemeConfig.tokens.light.primary)
})

test("layout runtime fields export DOM attributes with CSS effects", () => {
  const config = {
    ...structuredClone(defaultThemeConfig),
    layout: {
      ...defaultThemeConfig.layout,
      density: "compact" as const,
      contentWidth: "fluid" as const,
      sidebarVariant: "standard" as const,
    },
  }

  expect(getThemeRootState(config, false)).toMatchObject({
    "data-density": "compact",
    "data-content-width": "fluid",
    "data-sidebar": "standard",
  })
  expect(JSON.parse(formatThemeConfigAsJson(config)).layout).toMatchObject(config.layout)

  assert.match(css, /data-density="compact"[^}]*--header-height: 52px/)
  assert.match(css, /data-density="comfortable"[^}]*--header-height: 56px/)
  assert.match(css, /data-content-width="fluid"[^}]*max-width: none/)
  assert.match(css, /data-content-width="centered"[^}]*max-width: 1440px/)
  assert.match(css, /data-sidebar="standard"[^}]*padding: 0/)
  assert.match(css, /data-sidebar="floating"[^}]*border-radius: var\(--radius\)/)
  assert.match(css, /data-sidebar="inset"[^}]*background: var\(--sidebar\)/)
})
