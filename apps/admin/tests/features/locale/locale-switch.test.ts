import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

test("locale switch renders every supported locale with selected state", async () => {
  const source = await readFile(new URL("../../../src/features/locale/locale-switch.tsx", import.meta.url), "utf8")

  assert.match(source, /APP_LOCALES\.map/)
  assert.match(source, /checked=\{option\.key === locale\}/)
  assert.match(source, /setLocale\(option\.key\)/)
})
