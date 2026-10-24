import { useContext, useLayoutEffect, useRef, type ContextType, type ReactNode } from "react"
import { UNSAFE_LocationContext as LocationContext } from "react-router"
import { canonicalizePathSearch } from "./route-url"
import type { NormalizedRoute } from "./route-model"
import { getRouteInstanceKey } from "./route-instance-key"
import { useRouteCacheStore } from "./route-cache-store"

interface CachedNode {
  element: ReactNode
  generation: number
  locationContext: ContextType<typeof LocationContext>
}

export function RouteCacheHost({
  route,
  pathSearch,
  children,
}: {
  route: NormalizedRoute
  pathSearch: string
  children: ReactNode
}) {
  // A cached outlet must retain its location while another route is entering.
  const locationContext = useContext(LocationContext)
  const displayedUrl = new URL(pathSearch, "http://rapidkit.local")
  const locationMatches =
    locationContext &&
    canonicalizePathSearch(locationContext.location.pathname, locationContext.location.search) ===
      canonicalizePathSearch(displayedUrl.pathname, displayedUrl.search)
  const entries = useRouteCacheStore((state) => state.entries)
  const nodes = useRef(new Map<string, CachedNode>())
  const cacheKey = getRouteInstanceKey(route, pathSearch)
  const currentMeta = entries[cacheKey]
  const refreshGeneration = useRouteCacheStore((state) => state.refreshGenerations[cacheKey] ?? 0)

  for (const key of nodes.current.keys()) {
    if (!entries[key] && key !== cacheKey) nodes.current.delete(key)
  }

  if (route.keepAlive) {
    const generation = currentMeta?.generation ?? 0
    const cached = nodes.current.get(cacheKey)
    if (!cached || cached.generation !== generation) {
      nodes.current.set(cacheKey, {
        element: children,
        generation,
        locationContext: locationMatches ? locationContext : (cached?.locationContext ?? locationContext),
      })
    } else if (locationMatches) {
      cached.locationContext = locationContext
    }
  }

  useLayoutEffect(() => {
    if (!route.keepAlive) {
      useRouteCacheStore.getState().activate("")
      return
    }
    const store = useRouteCacheStore.getState()
    const evicted = store.register({
      cacheKey,
      routeName: route.name,
      fixed: route.fixedIndexInTab !== undefined,
    })
    evicted.forEach((key) => nodes.current.delete(key))
    if (!evicted.includes(cacheKey)) store.activate(cacheKey)
  }, [cacheKey, route.fixedIndexInTab, route.keepAlive, route.name])

  return (
    <>
      {[...nodes.current].map(([key, cached]) => {
        const active = route.keepAlive && key === cacheKey
        return (
          <div
            key={`${key}:${cached.generation}`}
            aria-hidden={!active}
            data-route-cache-key={key}
            hidden={!active}
            inert={!active}
            className="h-full"
          >
            {cached.locationContext ? (
              <LocationContext.Provider value={cached.locationContext}>{cached.element}</LocationContext.Provider>
            ) : (
              cached.element
            )}
          </div>
        )
      })}
      {!route.keepAlive && (
        <div key={`${cacheKey}:${refreshGeneration}`} className="h-full">
          {children}
        </div>
      )}
    </>
  )
}
