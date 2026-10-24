import type { RouteSnapshot } from "./route-model"
import { findFirstNavigablePath, findRouteForPath, isDefaultRouteCandidate } from "./route-model"
import { getRouteInstanceKey } from "./route-instance-key"

interface RuntimeTab {
  key: string
  routeName: string
  path: string
}

export interface ReconcileInput {
  snapshot: RouteSnapshot
  homeName: string
  currentPathname: string
  currentPathSearch?: string
  tabs: RuntimeTab[]
}

export interface RouteReconcileResult {
  nextPath: string | null
  validTabKeys: ReadonlySet<string>
  validCacheKeys: ReadonlySet<string>
}

export function reconcileRouteRuntime({
  snapshot,
  homeName,
  currentPathname,
  currentPathSearch = currentPathname,
  tabs,
}: ReconcileInput): RouteReconcileResult {
  const validTabs = tabs.filter((tab) => {
    const route = snapshot.byName[tab.routeName]
    return Boolean(route && route.kind !== "layout" && route.kind !== "external")
  })
  const validTabKeys = new Set(validTabs.map((tab) => tab.key))
  const validCacheKeys = new Set(
    validTabs.filter((tab) => snapshot.byName[tab.routeName]?.keepAlive).map((tab) => tab.key),
  )
  const current = findRouteForPath(snapshot, currentPathname)
  if (current?.keepAlive) validCacheKeys.add(getRouteInstanceKey(current, currentPathSearch))
  const currentAuthorized = current && current.kind !== "external" && current.kind !== "layout"
  const configuredHome = snapshot.byName[homeName]
  const home =
    configuredHome && isDefaultRouteCandidate(configuredHome)
      ? configuredHome.fullPath
      : (findFirstNavigablePath(snapshot.tree) ?? "/404")

  return { nextPath: currentAuthorized ? null : home, validTabKeys, validCacheKeys }
}
