import type { RouteObject } from "react-router"
import { findFirstNavigablePath, type NormalizedRoute, type RouteSnapshot } from "./route-model"
import { lazyImport } from "./lazy-import"
import { RouteErrorBoundary } from "./route-error-boundary"
import { DefaultSearchRedirect } from "./default-search-redirect"
import { ExternalRoute } from "./external-route"
import { IframeRoute } from "./iframe-route"

export function generateRoutes(backendRoutes: NormalizedRoute[]): RouteObject[] {
  return backendRoutes.map((route) => {
    const routeObject: RouteObject = {
      path: route.path,
      errorElement: <RouteErrorBoundary />,
    }

    if (route.kind === "external" && route.href) {
      routeObject.element = <ExternalRoute href={route.href} />
    } else if (route.kind === "iframe") {
      routeObject.element = (
        <DefaultSearchRedirect defaultSearch={route.defaultSearch}>
          <IframeRoute src={route.href} title={route.title} />
        </DefaultSearchRedirect>
      )
    } else if (route.component) {
      const loadComponent = lazyImport(route.component)
      routeObject.lazy = async () => {
        const module = await loadComponent()
        const Page = module.default
        return {
          Component: () => (
            <DefaultSearchRedirect defaultSearch={route.defaultSearch}>
              <Page />
            </DefaultSearchRedirect>
          ),
        }
      }
    }

    if (route.children?.length) {
      routeObject.children = generateRoutes(route.children)
    }

    return routeObject
  })
}

export function resolveAuthorizedHomePath(snapshot: RouteSnapshot, homeName: string): string {
  const configured = snapshot.byName[homeName]
  if (configured && (configured.kind === "view" || configured.kind === "iframe")) return configured.fullPath
  return findFirstNavigablePath(snapshot.tree) ?? "/404"
}
