import type { BackendRoute } from "@/services/api/route"
import { matchPath } from "react-router"
import { joinRoutePath, mergeDefaultSearch, parseSafeExternalUrl } from "./route-url"

export type RouteKind = "layout" | "view" | "external" | "iframe"
export type RouteDiagnosticCode = "duplicate-name" | "duplicate-path" | "unsafe-href"

export interface RouteDiagnostic {
  code: RouteDiagnosticCode
  routeName: string
  value: string
}

export interface NormalizedRoute {
  id: string
  name: string
  path: string
  fullPath: string
  kind: RouteKind
  component?: string
  title: string
  i18nKey?: string
  icon?: string
  localIcon?: string
  activeMenu?: string
  order: number
  hideInMenu: boolean
  keepAlive: boolean
  multiTab: boolean
  fixedIndexInTab?: number
  defaultSearch: string
  href?: string
  children: NormalizedRoute[]
}

export interface RouteSnapshot {
  tree: NormalizedRoute[]
  byName: Readonly<Record<string, NormalizedRoute>>
  byPath: Readonly<Record<string, NormalizedRoute>>
  diagnostics: readonly RouteDiagnostic[]
}

export const EMPTY_ROUTE_SNAPSHOT: RouteSnapshot = Object.freeze({
  tree: [],
  byName: Object.freeze({}),
  byPath: Object.freeze({}),
  diagnostics: Object.freeze([]),
})

export function isInternalRoute(route: Pick<NormalizedRoute, "kind">): boolean {
  return route.kind === "view" || route.kind === "iframe"
}

function getRouteKind(route: BackendRoute, safeHref?: string): RouteKind {
  if (route.component?.includes("_builtin_iframe-page")) return "iframe"
  if (safeHref) return "external"
  if (!route.component) return route.children?.length ? "layout" : "view"
  if (!route.component.includes("view.")) return "layout"
  return "view"
}

export function normalizeRoutes(routes: BackendRoute[]): RouteSnapshot {
  const byName: Record<string, NormalizedRoute> = {}
  const byPath: Record<string, NormalizedRoute> = {}
  const diagnostics: RouteDiagnostic[] = []

  const visit = (items: BackendRoute[], parentPath = "/"): NormalizedRoute[] =>
    items
      .map((route): NormalizedRoute | null => {
        const fullPath = joinRoutePath(parentPath, route.path)
        if (byName[route.name]) {
          diagnostics.push({ code: "duplicate-name", routeName: route.name, value: route.name })
          return null
        }
        if (byPath[fullPath]) {
          diagnostics.push({ code: "duplicate-path", routeName: route.name, value: fullPath })
          return null
        }

        const parsedHref = parseSafeExternalUrl(route.meta?.href)
        if (route.meta?.href && !parsedHref) {
          diagnostics.push({ code: "unsafe-href", routeName: route.name, value: route.meta.href })
        }
        const href = parsedHref?.href
        const item: NormalizedRoute = {
          id: route.id ?? route.name,
          name: route.name,
          path: route.path,
          fullPath,
          kind: getRouteKind(route, href),
          ...(route.component ? { component: route.component } : {}),
          title: route.meta?.title ?? route.name,
          ...(route.meta?.i18nKey ? { i18nKey: route.meta.i18nKey } : {}),
          ...(route.meta?.icon ? { icon: route.meta.icon } : {}),
          ...(route.meta?.localIcon ? { localIcon: route.meta.localIcon } : {}),
          ...(route.meta?.activeMenu ? { activeMenu: route.meta.activeMenu } : {}),
          order: route.meta?.order ?? 0,
          hideInMenu: route.meta?.hideInMenu ?? false,
          keepAlive: route.meta?.keepAlive ?? false,
          multiTab: route.meta?.multiTab ?? false,
          ...(route.meta?.fixedIndexInTab === null || route.meta?.fixedIndexInTab === undefined
            ? {}
            : { fixedIndexInTab: route.meta.fixedIndexInTab }),
          defaultSearch: mergeDefaultSearch("", route.meta?.query),
          ...(href ? { href } : {}),
          children: [],
        }
        byName[item.name] = item
        byPath[item.fullPath] = item
        item.children = visit(route.children ?? [], fullPath)
        return item
      })
      .filter((item): item is NormalizedRoute => item !== null)
      .sort((a, b) => a.order - b.order)

  const tree = visit(routes)
  return { tree, byName, byPath, diagnostics }
}

export function findFirstNavigablePath(routes: readonly NormalizedRoute[]): string | undefined {
  for (const route of routes) {
    const childPath = findFirstNavigablePath(route.children)
    if (childPath) return childPath
    if (isInternalRoute(route)) return route.fullPath
  }
}

export function findRouteForPath(snapshot: RouteSnapshot, pathname: string): NormalizedRoute | undefined {
  return (
    snapshot.byPath[pathname] ??
    Object.values(snapshot.byPath).find((route) => matchPath({ path: route.fullPath, end: true }, pathname))
  )
}
