import { lazy } from "react"
import type { RouteObject } from "react-router"
import type { BackendRoute } from "@/services/api/route"
import { lazyImport } from "./lazy-import"

export function generateRoutes(backendRoutes: BackendRoute[]): RouteObject[] {
  return backendRoutes.map((route) => {
    const routeObject: RouteObject = {
      path: route.path,
    }

    if (route.component) {
      const LazyComponent = lazy(lazyImport(route.component))
      routeObject.element = <LazyComponent />
    }

    if (route.children?.length) {
      routeObject.children = generateRoutes(route.children)
    }

    return routeObject
  })
}
