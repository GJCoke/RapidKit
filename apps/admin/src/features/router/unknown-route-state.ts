export type UnknownRouteState = "login" | "loading" | "error" | "forbidden" | "not-found"

interface UnknownRouteStateInput {
  token: string
  routeName: string | null
  isLoading: boolean
  hasError?: boolean
  exists?: boolean
}

export function pathToRouteName(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  return segments.length ? segments.join("_") : null
}

export function resolveUnknownRouteState({
  token,
  routeName,
  isLoading,
  hasError,
  exists,
}: UnknownRouteStateInput): UnknownRouteState {
  if (!token) return "login"
  if (!routeName) return "not-found"
  if (isLoading) return "loading"
  if (hasError) return "error"
  return exists ? "forbidden" : "not-found"
}
