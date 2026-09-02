import { createElement, lazy } from "react"
import type { ComponentType } from "react"

export interface DashboardModule {
  key: string
  capability?: string
  colSpan: string
  Component: ComponentType
}

const StatCardsModule = lazy(async () => {
  const { StatCards } = await import("./modules/stat-cards")

  return {
    default: function DashboardStatCards() {
      return createElement(StatCards, { stats: [] })
    },
  }
})

const TrendChartsModule = lazy(async () => {
  const { TrendCharts } = await import("./modules/trend-charts")

  return {
    default: function DashboardTrendCharts() {
      return createElement(TrendCharts, { title: "", data: [] })
    },
  }
})

const ActivityFeedModule = lazy(async () => {
  const { ActivityFeed } = await import("./modules/activity-feed")

  return {
    default: function DashboardActivityFeed() {
      return createElement(ActivityFeed, { items: [] })
    },
  }
})

export const dashboardModules: DashboardModule[] = [
  {
    key: "stat-cards",
    capability: "dashboard.overview",
    colSpan: "col-span-24",
    Component: StatCardsModule,
  },
  {
    key: "trend-charts",
    capability: "dashboard.trends",
    colSpan: "col-span-24 xl:col-span-15",
    Component: TrendChartsModule,
  },
  {
    key: "activity-feed",
    capability: "dashboard.activity",
    colSpan: "col-span-24 xl:col-span-9",
    Component: ActivityFeedModule,
  },
]

export function selectDashboardModules(allowedModules: readonly string[]) {
  return dashboardModules.filter((module) => !module.capability || allowedModules.includes(module.capability))
}
