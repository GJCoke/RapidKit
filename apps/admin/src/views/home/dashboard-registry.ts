import { lazy, type ComponentType } from "react"
import { selectHomeModules, type HomeCapability } from "./modules/home-model"
export interface DashboardModule {
  key: string
  capability: HomeCapability
  colSpan: string
  Component: ComponentType
}
const overview = lazy(async () => ({
  default: (await import("./modules/operations-overview")).OperationsOverviewModule,
}))
const health = lazy(async () => ({ default: (await import("./modules/application-health")).ApplicationHealthModule }))
const activity = lazy(async () => ({ default: (await import("./modules/activity-feed-module")).ActivityFeedModule }))
const business = lazy(async () => ({ default: (await import("./modules/application-health")).BusinessModule }))
const infrastructure = lazy(async () => ({
  default: (await import("./modules/infrastructure-overview")).InfrastructureModule,
}))
const api = lazy(async () => ({ default: (await import("./modules/api-overview")).ApiOverviewModule }))
export const dashboardModules: DashboardModule[] = [
  { key: "overview", capability: "dashboard.overview", colSpan: "col-span-24 xl:col-span-15", Component: overview },
  {
    key: "application-health",
    capability: "dashboard.application-health",
    colSpan: "col-span-24 xl:col-span-9",
    Component: health,
  },
  { key: "activity", capability: "dashboard.activity", colSpan: "col-span-24 xl:col-span-15", Component: activity },
  { key: "business", capability: "dashboard.business", colSpan: "col-span-24 xl:col-span-9", Component: business },
  {
    key: "infrastructure",
    capability: "dashboard.infrastructure",
    colSpan: "col-span-24 xl:col-span-9",
    Component: infrastructure,
  },
  { key: "api-monitoring", capability: "dashboard.api-monitoring", colSpan: "col-span-24", Component: api },
]
export function selectDashboardModules(allowedModules: readonly string[]) {
  const keys = selectHomeModules(allowedModules)
  return dashboardModules.filter((module) => keys.includes(module.capability))
}
