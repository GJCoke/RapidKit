import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const css = await readFile(new URL("../../src/styles/globals.css", import.meta.url), "utf8")
const main = await readFile(new URL("../../src/main.tsx", import.meta.url), "utf8")

function block(selector: string) {
  const start = css.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `missing ${selector} theme block`)
  const end = css.indexOf("\n}", start)
  assert.notEqual(end, -1, `unterminated ${selector} theme block`)
  return css.slice(start, end)
}

test("visual tokens use the shadcn base-nova neutral defaults", () => {
  const light = block(":root")
  const dark = block(".dark")

  assert.match(light, /--radius: 0\.625rem;/)
  assert.match(light, /--background: oklch\(1 0 0\);/)
  assert.match(light, /--foreground: oklch\(0\.145 0 0\);/)
  assert.match(light, /--primary: oklch\(0\.205 0 0\);/)
  assert.match(light, /--destructive: oklch\(0\.577 0\.245 27\.325\);/)

  assert.match(dark, /--background: oklch\(0\.145 0 0\);/)
  assert.match(dark, /--foreground: oklch\(0\.985 0 0\);/)
  assert.match(dark, /--card: oklch\(0\.205 0 0\);/)
  assert.match(dark, /--muted-foreground: oklch\(0\.708 0 0\);/)
})

test("RapidKit functional theme tokens remain available", () => {
  for (const token of [
    "--success:",
    "--warning:",
    "--info:",
    "--header-height:",
    "--grid-template-columns-24:",
    "--shadow-header-val:",
  ]) {
    assert.match(css, new RegExp(token))
  }
})

test("density presets coordinate menu and layout dimensions", () => {
  assert.match(css, /data-density="compact"[^}]*--menu-item-height: 32px/)
  assert.match(css, /data-density="comfortable"[^}]*--menu-item-height: 36px/)
})

test("Geist is loaded and mapped as the default sans and heading font", () => {
  assert.match(main, /import "@fontsource-variable\/geist"/)
  assert.match(css, /--font-sans:\s*"Geist Variable"/)
  assert.match(css, /--font-heading:\s*"Geist Variable"/)
})
