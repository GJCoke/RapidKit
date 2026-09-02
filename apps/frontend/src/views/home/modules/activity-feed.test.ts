import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("./activity-feed.vue", import.meta.url), "utf8")

test("offers all four curated activity categories", () => {
  for (const category of ["all", "task", "user", "system", "alert"]) {
    assert.match(source, new RegExp(`value: "${category}"`))
  }
})

test("renders server supplied translation keys without audit dictionary guessing", () => {
  assert.match(source, /item\.titleKey/)
  assert.match(source, /item\.titleParams/)
  assert.doesNotMatch(source, /auditDict|eventType\.split|resourceLabel|actionLabel/)
})

test("keeps the activity list scrollable within the fixed-height card", () => {
  assert.match(source, /h-400px/)
  assert.match(source, /<NScrollbar class="flex-1 min-h-0"/)
})
