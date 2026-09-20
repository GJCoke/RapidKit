import type { NormalizedRoute } from "./route-model"
import { canonicalizePathSearch } from "./route-url"

export interface RouteTabDescriptor {
  key: string
  routeName: string
  label: string
  path: string
  icon?: string
  localIcon?: string
  fixedIndex?: number
  closable: boolean
}

function splitPathSearch(value: string) {
  const url = new URL(value, "http://rapidkit.local")
  return canonicalizePathSearch(url.pathname, url.search)
}

export function getRouteInstanceKey(route: NormalizedRoute, pathSearch: string): string {
  return route.multiTab ? `route:${route.name}:${splitPathSearch(pathSearch)}` : `route:${route.name}`
}

export function createTabFromLocation(
  route: NormalizedRoute,
  pathSearch: string,
  translate?: (key: string) => string,
): RouteTabDescriptor {
  const path = splitPathSearch(pathSearch)
  return {
    key: getRouteInstanceKey(route, path),
    routeName: route.name,
    label: route.i18nKey && translate ? translate(route.i18nKey) : route.title,
    path,
    ...(route.icon ? { icon: route.icon } : {}),
    ...(route.localIcon ? { localIcon: route.localIcon } : {}),
    ...(route.fixedIndexInTab === undefined ? {} : { fixedIndex: route.fixedIndexInTab }),
    closable: route.fixedIndexInTab === undefined,
  }
}
