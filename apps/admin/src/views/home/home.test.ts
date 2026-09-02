import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { ActivityFeed } from "./modules/activity-feed"
import { StatCards } from "./modules/stat-cards"
import { TrendCharts } from "./modules/trend-charts"

const localesUrl = new URL("../../locales/", import.meta.url)

await i18n.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": { translation: { state: { empty: "No data" } } } },
})

test("dashboard registry uses backend capability keys and filters by allowedModules", async () => {
  const { dashboardModules, selectDashboardModules } = await import("./dashboard-registry")

  assert.deepEqual(
    dashboardModules.map(({ key, capability, colSpan }) => ({ key, capability, colSpan })),
    [
      { key: "stat-cards", capability: "dashboard.overview", colSpan: "col-span-24" },
      { key: "trend-charts", capability: "dashboard.trends", colSpan: "col-span-24 xl:col-span-15" },
      { key: "activity-feed", capability: "dashboard.activity", colSpan: "col-span-24 xl:col-span-9" },
    ],
  )
  assert.deepEqual(
    selectDashboardModules(["dashboard.activity", "dashboard.trends"]).map((module) => module.key),
    ["trend-charts", "activity-feed"],
  )
  assert.deepEqual(selectDashboardModules(["dashboard.application-health"]), [])
})

test("endpoint-less dashboard modules render the localized empty state", async () => {
  const modules = [
    createElement(StatCards, { stats: [] }),
    createElement(TrendCharts, { title: "User activity", data: [] }),
    createElement(ActivityFeed, { items: [] }),
  ]

  for (const module of modules) {
    assert.match(renderToStaticMarkup(module), />No data</)
  }
})

test("both locales define the Home dashboard copy", async () => {
  const localeFiles = await Promise.all([
    readFile(new URL("en-US/common.json", localesUrl), "utf8"),
    readFile(new URL("zh-CN/common.json", localesUrl), "utf8"),
  ])

  for (const source of localeFiles) {
    const locale = JSON.parse(source) as { home: Record<string, string> }
    assert.deepEqual(Object.keys(locale.home).sort(), ["restricted", "trendChart", "welcome"])
    assert.ok(Object.values(locale.home).every(Boolean))
  }
})
