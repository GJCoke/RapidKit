interface RouteLocation {
  pathname: string
  search: string
  hash: string
}

interface RouteLoadInput {
  token: string | null
  isLoading: boolean
  isError: boolean
  response?: { data: unknown; error: unknown }
  location: RouteLocation
}

export type RouteLoadState = { kind: "ready" } | { kind: "loading" } | { kind: "error"; returnTo: string }

export function resolveRouteLoadState(input: RouteLoadInput): RouteLoadState {
  if (!input.token) return { kind: "ready" }
  if (input.isError || input.response?.error) {
    return { kind: "error", returnTo: `${input.location.pathname}${input.location.search}${input.location.hash}` }
  }
  if (input.isLoading || !input.response?.data) return { kind: "loading" }
  return { kind: "ready" }
}
