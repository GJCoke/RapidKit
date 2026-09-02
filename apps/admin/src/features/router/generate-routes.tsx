import { lazy } from "react"
import type { RouteObject } from "react-router"
import type { BackendRoute, UserRouteResponse } from "@/services/api/route"
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

function findRoutePath(routes: BackendRoute[], name: string): string | undefined {
  for (const route of routes) {
    if (route.name === name) return route.path
    const childPath = route.children?.length ? findRoutePath(route.children, name) : undefined
    if (childPath) return childPath
  }
}

function findFirstLeafPath(routes: BackendRoute[]): string | undefined {
  for (const route of routes) {
    const childPath = route.children?.length ? findFirstLeafPath(route.children) : undefined
    if (childPath) return childPath
    if (!route.children?.length) return route.path
  }
}

export function resolveAuthorizedHomePath(response: UserRouteResponse): string {
  return findRoutePath(response.routes, response.home) ?? findFirstLeafPath(response.routes) ?? "/404"
}
