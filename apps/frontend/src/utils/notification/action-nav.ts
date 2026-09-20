import type { RouteKey } from "@elegant-router/types"
import { useRouterPush } from "@/hooks/common/router"
import { router } from "@/router"

const ROUTE_NAME_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/i

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

export async function navigateToAction(action?: Api.Notification.ActionRef | null): Promise<boolean> {
  if (!action?.route || !ROUTE_NAME_RE.test(action.route) || !router.hasRoute(action.route)) return false

  const params = normalizeParams(action.params)
  if (params === null) return false

  const { routerPushByKey } = useRouterPush(false)
  await routerPushByKey(action.route as RouteKey, { params })
  return true
}
