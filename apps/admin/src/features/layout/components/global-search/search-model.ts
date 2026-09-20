import { isInternalRoute, type RouteSnapshot } from "@/features/router/route-model"

export interface SearchRouteItem {
  routeName: string
  path: string
  label: string
  keywords: string[]
}

export type Translate = (key: string, options?: { defaultValue?: string }) => string

export function buildRouteSearchIndex(snapshot: RouteSnapshot, translate: Translate): SearchRouteItem[] {
  return Object.values(snapshot.byName)
    .filter((route) => isInternalRoute(route) && !route.hideInMenu)
    .sort((left, right) => left.order - right.order)
    .map((route) => {
      const label = route.i18nKey ? translate(route.i18nKey, { defaultValue: route.title }) : route.title
      return {
        routeName: route.name,
        path: route.fullPath,
        label,
        keywords: [label, route.title, route.fullPath],
      }
    })
}

export function searchRoutes(index: SearchRouteItem[], keyword: string): SearchRouteItem[] {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword) return index

  return index.filter((item) => item.keywords.some((value) => value.toLocaleLowerCase().includes(normalizedKeyword)))
}
