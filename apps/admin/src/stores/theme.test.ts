import assert from "node:assert/strict"
import test from "node:test"
import { migrateThemeState } from "./theme"

test("theme migration changes the legacy default radius but preserves explicit choices", () => {
  assert.equal(migrateThemeState({ radius: 8 }, 0).radius, 6)
  assert.equal(migrateThemeState({ radius: 10 }, 0).radius, 10)
  assert.equal(migrateThemeState({ radius: 8 }, 1).radius, 8)
})
