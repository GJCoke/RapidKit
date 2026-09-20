import { useEffect, useLayoutEffect, useReducer, useRef, type AnimationEvent, type ReactNode } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useLocation, useOutlet } from "react-router"
import { cn } from "@rapidkit/ui/lib/utils"
import { useEffectiveThemeConfig } from "@/features/theme"
import { useRouteStore } from "@/stores/route"
import { RouteCacheHost } from "@/features/router/route-cache"
import { findRouteForPath } from "@/features/router/route-model"
import { getRouteInstanceKey } from "@/features/router/route-instance-key"
import { useRouteCacheStore } from "@/features/router/route-cache-store"

export type RouteTransitionPhase = "idle" | "exiting" | "entering"

export interface RouteTransitionState {
  displayedKey: string
  pendingKey: string | null
  phase: RouteTransitionPhase
  refreshing?: boolean
}

type RouteTransitionEvent =
  | { type: "navigate"; key: string; animate: boolean }
  | { type: "refresh"; animate: boolean }
  | { type: "animationEnd" }

export function applyRouteRefresh(queryClient: QueryClient, cacheKey: string) {
  void queryClient.invalidateQueries({ refetchType: "none" })
  useRouteCacheStore.getState().refresh(cacheKey)
}

export function transitionRoute(state: RouteTransitionState, event: RouteTransitionEvent): RouteTransitionState {
  if (event.type === "refresh") {
    return event.animate ? { ...state, phase: "exiting", refreshing: true } : state
  }

  if (event.type === "navigate") {
    if (event.key === state.displayedKey && state.phase === "idle") return state
    if (!event.animate) return { displayedKey: event.key, pendingKey: null, phase: "idle" }
    return { ...state, pendingKey: event.key, phase: "exiting" }
  }

  if (state.phase === "exiting" && state.pendingKey) {
    return { displayedKey: state.pendingKey, pendingKey: null, phase: "entering" }
  }

  if (state.phase === "exiting" && state.refreshing) {
    return { ...state, phase: "entering" }
  }

  if (state.phase === "entering") {
    const { refreshing: _refreshing, ...next } = state
    return { ...next, phase: "idle" }
  }
  return state
}

export function RouteTransition() {
  const theme = useEffectiveThemeConfig()
  const queryClient = useQueryClient()
  const outlet = useOutlet()
  const { pathname, search } = useLocation()
  const snapshot = useRouteStore((store) => store.snapshot)
  const routeKey = `${pathname}${search}`
  const outlets = useRef(new Map<string, ReactNode>([[routeKey, outlet]]))
  const [state, dispatch] = useReducer(transitionRoute, {
    displayedKey: routeKey,
    pendingKey: null,
    phase: "idle",
  })
  outlets.current.set(routeKey, outlet)
  for (const key of outlets.current.keys()) {
    if (key !== routeKey && key !== state.displayedKey && key !== state.pendingKey) outlets.current.delete(key)
  }

  useLayoutEffect(() => {
    dispatch({ type: "navigate", key: routeKey, animate: theme.experience.pageMotion })
  }, [routeKey, theme.experience.pageMotion])

  const displayedPathname = new URL(state.displayedKey, "http://rapidkit.local").pathname
  const displayedRoute = findRouteForPath(snapshot, displayedPathname)
  const displayedInstanceKey = displayedRoute ? getRouteInstanceKey(displayedRoute, state.displayedKey) : null
  const pendingRefreshKey = useRouteCacheStore((store) => store.pendingRefreshKey)

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return
    if (state.phase === "exiting") {
      document.querySelector<HTMLElement>("[data-layout-scroll=content]")?.parentElement?.scrollTo({ left: 0, top: 0 })
      if (state.refreshing && pendingRefreshKey) applyRouteRefresh(queryClient, pendingRefreshKey)
    }
    const previousKey = state.displayedKey
    dispatch({ type: "animationEnd" })
    if (state.phase === "exiting" && !state.refreshing) outlets.current.delete(previousKey)
    if (state.phase === "entering" && state.refreshing) useRouteCacheStore.getState().completeRefresh()
  }

  useEffect(() => {
    if (!pendingRefreshKey || pendingRefreshKey !== displayedInstanceKey || state.phase !== "idle") return
    if (theme.experience.pageMotion) {
      dispatch({ type: "refresh", animate: true })
      return
    }
    applyRouteRefresh(queryClient, pendingRefreshKey)
    useRouteCacheStore.getState().completeRefresh()
  }, [displayedInstanceKey, pendingRefreshKey, queryClient, state.phase, theme.experience.pageMotion])

  return (
    <div
      className={cn(
        "h-full bg-muted/30 p-4",
        state.phase === "exiting" && theme.experience.pageMotion && `route-${theme.experience.motionPreset}-exit`,
        state.phase === "entering" && theme.experience.pageMotion && `route-${theme.experience.motionPreset}-enter`,
      )}
      data-route-transition={state.phase}
      onAnimationEnd={handleAnimationEnd}
    >
      {displayedRoute ? (
        <RouteCacheHost route={displayedRoute} pathSearch={state.displayedKey}>
          {outlets.current.get(state.displayedKey)}
        </RouteCacheHost>
      ) : (
        outlets.current.get(state.displayedKey)
      )}
    </div>
  )
}
