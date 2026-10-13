import type { RouteKey } from "@elegant-router/types"
import { isNavigationFailure, NavigationFailureType } from "vue-router"
import { useRouterPush } from "@/hooks/common/router"
import { router } from "@/router"

const ROUTE_NAME_RE = /^[a-z][a-z0-9_-]*$/i
const MENU_ROUTE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i

function samePath(left: string, right: string): boolean {
  const segments = left.split("/")
  const snapshot = right.split("/")
  // Decode each segment separately so an encoded slash cannot become a new path level.
  return (
    segments.length === snapshot.length &&
    segments.every((part, index) => decodeURIComponent(part) === decodeURIComponent(snapshot[index]))
  )
}

function normalizeParams(params?: Record<string, unknown>): Record<string, string> | undefined | null {
  if (!params) return undefined

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      normalized[key] = value
    } else if (typeof value === "number" && Number.isFinite(value)) {
      normalized[key] = String(value)
    } else {
      return null
    }
  }
  return normalized
}

export function validExternalActionUrl(value: unknown): value is string {
  // oxlint-disable-next-line no-control-regex -- Reject URL control characters before parsing.
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return false
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

export async function navigateToAction(
  action?: Api.Notification.ActionRef | null,
  options: { newWindow?: boolean } = {},
): Promise<boolean> {
  if (action?.type === "external") {
    if (!validExternalActionUrl(action.url)) return false
    window.open(action.url, "_blank", "noopener,noreferrer")
    return true
  }
  const routeNamePattern = action?.type === "menu" ? MENU_ROUTE_NAME_RE : ROUTE_NAME_RE
  if (!action?.route || !routeNamePattern.test(action.route) || !router.hasRoute(action.route)) return false

  const params = normalizeParams(action.params)
  if (params === null) return false

  const query = normalizeParams(action.query)
  if (query === null) return false
  try {
    let result
    if (action.type === "menu") {
      if (
        typeof action.path !== "string" ||
        !/^\/(?!\/)/.test(action.path) ||
        // oxlint-disable-next-line no-control-regex -- Path snapshots must not contain controls or URL delimiters.
        /[\u0000-\u0020\u007f?#\\]/.test(action.path)
      )
        return false
      const currentTarget = router.resolve({ name: action.route, params })
      if (!samePath(currentTarget.path, action.path)) return false
      if (options.newWindow) {
        const destination = router.resolve({ name: action.route, params, query })
        if (router.resolve(destination.fullPath).name !== action.route) return false
        window.open(destination.href, "_blank", "noopener,noreferrer")
        return true
      }
      // Keep the selected menu identity when a static route also matches this pathname.
      result = await router.push({ name: action.route, params, query })
    } else {
      if (options.newWindow) {
        const destination = router.resolve({ name: action.route, params, query })
        if (router.resolve(destination.fullPath).name !== action.route) return false
        window.open(destination.href, "_blank", "noopener,noreferrer")
        return true
      }
      const { routerPushByKey } = useRouterPush(false)
      result = await routerPushByKey(action.route as RouteKey, { params, ...(query ? { query } : {}) })
    }
    return !isNavigationFailure(result, NavigationFailureType.aborted | NavigationFailureType.cancelled)
  } catch {
    return false
  }
}
