import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const activityFeedSource = readFileSync(new URL("./activity-feed.vue", import.meta.url), "utf8")
const trendChartsSource = readFileSync(new URL("./trend-charts.vue", import.meta.url), "utf8")
const dashboardSource = readFileSync(new URL("../composables/use-dashboard.ts", import.meta.url), "utf8")

test("uses the same fixed height for trend and activity cards", () => {
  assert.match(activityFeedSource, /class="[^"]*h-400px[^"]*overflow-hidden[^"]*"/)
  assert.match(trendChartsSource, /<NCard[^>]*class="[^"]*h-400px[^"]*"/)
})

test("keeps the activity list scrollable within the fixed-height card", () => {
  assert.match(activityFeedSource, /<NScrollbar class="flex-1 min-h-0"/)
})

test("selects the last 30 days when the dashboard initializes", () => {
  assert.match(dashboardSource, /const trendRange = ref<[^>]+>\("30d"\)/)
})
