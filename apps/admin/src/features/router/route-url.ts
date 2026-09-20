import type { BackendRoute } from "@/services/api/route"

export type RouteQueryItem = NonNullable<NonNullable<BackendRoute["meta"]>["query"]>[number]

function normalizePath(path: string) {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/")
  return collapsed === "/" ? collapsed : collapsed.replace(/\/$/, "")
}

export function joinRoutePath(parentPath: string, childPath: string): string {
  if (childPath.startsWith("/")) return normalizePath(childPath)
  return normalizePath(`${normalizePath(parentPath)}/${childPath}`)
}

export function canonicalizePathSearch(pathname: string, search = ""): string {
  const params = new URLSearchParams(search)
  params.sort()
  const canonicalSearch = params.toString()
  return `${normalizePath(pathname)}${canonicalSearch ? `?${canonicalSearch}` : ""}`
}

export function mergeDefaultSearch(currentSearch: string, defaults?: RouteQueryItem[] | null): string {
  const params = new URLSearchParams()
  defaults?.forEach(({ key, value }) => params.set(key, value))
  new URLSearchParams(currentSearch).forEach((value, key) => params.set(key, value))
  params.sort()
  const result = params.toString()
  return result ? `?${result}` : ""
}

export function parseSafeExternalUrl(value?: string | null): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}
