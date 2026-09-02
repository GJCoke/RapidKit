import { lazy } from "react"
import type { ComponentType } from "react"

export interface DashboardModule {
  key: string
  capability?: string
  colSpan: string
  Component: ComponentType
}

const StatCardsModule = lazy(async () => {
  const { StatCardsModule } = await import("./modules/stat-cards-module")
  return { default: StatCardsModule }
})

const TrendChartsModule = lazy(async () => {
  const { TrendChartsModule } = await import("./modules/trend-charts-module")
  return { default: TrendChartsModule }
})

const ActivityFeedModule = lazy(async () => {
  const { ActivityFeedModule } = await import("./modules/activity-feed-module")
  return { default: ActivityFeedModule }
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
