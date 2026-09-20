import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const source = await readFile(new URL("../../src/stores/theme.ts", import.meta.url), "utf8")

test("theme store persists only the color scheme", () => {
  assert.doesNotMatch(source, /primaryColor|setPrimaryColor|\bradius\b|setRadius|migrateThemeState/)
  assert.match(source, /version:\s*2/)
  assert.match(source, /partialize:\s*\(state\)\s*=>\s*\(\{\s*colorScheme:\s*state\.colorScheme/)
})
