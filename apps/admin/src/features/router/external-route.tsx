import { useEffect, useRef } from "react"
import { Navigate, useLocation } from "react-router"
import { useRouteStore } from "@/stores/route"
import { parseSafeExternalUrl } from "./route-url"
import { findFirstNavigablePath } from "./route-model"

export interface ExternalNavigationAdapter {
  open: (url: string, target: "_blank", features: "noopener,noreferrer") => Window | null
}

export function openExternalRoute(
  href: string,
  adapter: ExternalNavigationAdapter = { open: (url, target, features) => window.open(url, target, features) },
): boolean {
  const url = parseSafeExternalUrl(href)
  if (!url) return false
  adapter.open(url.href, "_blank", "noopener,noreferrer")
  return true
}

export function ExternalRoute({ href }: { href: string }) {
  const opened = useRef(false)
  const location = useLocation()
  const snapshot = useRouteStore((state) => state.snapshot)

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    openExternalRoute(href)
  }, [href])

  const from = (location.state as { from?: unknown } | null)?.from
  const fallback = findFirstNavigablePath(snapshot.tree) ?? "/404"
  const target = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : fallback
  return <Navigate to={target} replace />
}
