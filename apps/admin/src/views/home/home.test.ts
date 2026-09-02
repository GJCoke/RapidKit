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
import { HomeDashboard, resolveHomeView } from "./home-dashboard"

const localesUrl = new URL("../../locales/", import.meta.url)

await i18n.use(initReactI18next).init({
  lng: "en-US",
  resources: {
    "en-US": {
      translation: {
        home: {
          currentDate: "Today: {{date}}",
          refresh: "Refresh",
          restricted: "Dashboard access is restricted.",
          revision: "Revision {{revision}}",
          statusReady: "Dashboard access ready",
          statusRefreshing: "Refreshing dashboard",
          welcome: "Welcome to RapidKit",
        },
        state: { empty: "No data", error: "Something went wrong", loading: "Loading...", retry: "Retry" },
      },
    },
  },
})

function renderHome(query: Parameters<typeof resolveHomeView>[0]) {
  return renderToStaticMarkup(
    createElement(HomeDashboard, {
      state: resolveHomeView(query),
      isRefreshing: false,
      now: new Date("2026-09-02T12:00:00Z"),
      onRefresh: () => undefined,
    }),
  )
}

const successfulResponse = (allowedModules: string[], revision = "revision-12345678") => ({
  data: { allowedModules, revision },
  error: null,
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

test("dashboard presentation modules render the localized empty state for genuinely empty data", async () => {
  const modules = [
    createElement(StatCards, { stats: [] }),
    createElement(TrendCharts, { title: "User activity", data: [] }),
    createElement(ActivityFeed, { items: [] }),
  ]

  for (const module of modules) {
    assert.match(renderToStaticMarkup(module), />No data</)
  }
})

test("Home renders its loading state", () => {
  const markup = renderHome({ isLoading: true, isError: false, refetch: () => undefined })

  assert.match(markup, />Loading\.\.\.</)
})

test("Home renders query-level and flat-response errors", () => {
  const queryError = renderHome({ isLoading: false, isError: true, refetch: () => undefined })
  const flatError = renderHome({
    isLoading: false,
    isError: false,
    data: { data: null, error: new Error("network") },
    refetch: () => undefined,
  })

  assert.match(queryError, />Something went wrong</)
  assert.match(flatError, />Something went wrong</)
  assert.match(queryError, />Retry</)
  assert.match(flatError, />Retry</)
})

test("Home error retry delegates to the capabilities query", () => {
  let retries = 0
  const state = resolveHomeView({
    isLoading: false,
    isError: true,
    refetch: () => {
      retries += 1
    },
  })

  assert.equal(state.kind, "error")
  if (state.kind !== "error") return
  state.retry()
  assert.equal(retries, 1)
})

test("Home renders restricted access when no registered module is granted", () => {
  const markup = renderHome({
    isLoading: false,
    isError: false,
    data: successfulResponse(["dashboard.application-health"]),
    refetch: () => undefined,
  })

  assert.match(markup, />Dashboard access is restricted\.</)
})

test("Home full state renders header metadata, refresh action, and Suspense fallback", () => {
  const markup = renderHome({
    isLoading: false,
    isError: false,
    data: successfulResponse(["dashboard.overview"]),
    refetch: () => undefined,
  })

  assert.match(markup, />Welcome to RapidKit</)
  assert.match(markup, /Dashboard access ready/)
  assert.match(markup, /September 2, 2026/)
  assert.match(markup, /Revision revision/)
  assert.match(markup, />Refresh</)
  assert.match(markup, />Loading\.\.\.</)
})

test("both locales define matching required Home dashboard copy", async () => {
  const localeFiles = await Promise.all([
    readFile(new URL("en-US/common.json", localesUrl), "utf8"),
    readFile(new URL("zh-CN/common.json", localesUrl), "utf8"),
  ])

  const [en, zh] = localeFiles.map((source) => JSON.parse(source) as { home: Record<string, unknown> })
  const requiredKeys = [
    "activityFeed",
    "currentDate",
    "refresh",
    "restricted",
    "revision",
    "statusReady",
    "statusRefreshing",
    "todayTasks",
    "trendChart",
    "userTotal",
    "userTrend",
    "welcome",
    "workerCount",
  ]

  for (const locale of [en, zh]) {
    for (const key of requiredKeys) assert.ok(locale.home[key], `missing home.${key}`)
  }
  assert.deepEqual(Object.keys(en.home).sort(), Object.keys(zh.home).sort())
})
