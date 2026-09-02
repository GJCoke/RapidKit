import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./operations-overview.vue", import.meta.url), "utf8")

test("matches the compact seven-day dual-axis reference", () => {
  assert.match(source, /requestCount/)
  assert.match(source, /averageResponseTime/)
  assert.match(source, /yAxisIndex: 1/)
  assert.doesNotMatch(source, /NDatePicker/)
  assert.doesNotMatch(source, /chartMetric/)
})
