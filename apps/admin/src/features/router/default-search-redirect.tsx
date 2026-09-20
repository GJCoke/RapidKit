import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"
import { canonicalizePathSearch, mergeDefaultSearch } from "./route-url"

export function resolveDefaultSearchRedirect(
  pathname: string,
  search: string,
  hash: string,
  defaultSearch: string,
): string | null {
  const defaults = [...new URLSearchParams(defaultSearch)].map(([key, value]) => ({ key, value }))
  const merged = mergeDefaultSearch(search, defaults)
  if (canonicalizePathSearch(pathname, merged) === canonicalizePathSearch(pathname, search)) return null
  return `${pathname}${merged}${hash}`
}

export function DefaultSearchRedirect({ defaultSearch, children }: { defaultSearch: string; children: ReactNode }) {
  const location = useLocation()
  const target = resolveDefaultSearchRedirect(location.pathname, location.search, location.hash, defaultSearch)
  return target ? <Navigate to={target} replace /> : children
}
