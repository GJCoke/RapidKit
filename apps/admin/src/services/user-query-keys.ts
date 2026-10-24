import type { UserSearchParams } from "@/services/api/user"

function normalizeParams(params: UserSearchParams) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

export const userQueryKeys = {
  root: (token: string | number | null) => ["users", token] as const,
  lists: (token: string | number | null) => [...userQueryKeys.root(token), "list"] as const,
  list: (token: string | number | null, params: UserSearchParams = {}) =>
    [...userQueryKeys.lists(token), normalizeParams(params)] as const,
  options: (token: string | number | null) => [...userQueryKeys.root(token), "options"] as const,
  roles: (token: string | number | null) => [...userQueryKeys.options(token), "roles"] as const,
  users: (token: string | number | null) => [...userQueryKeys.options(token), "users"] as const,
  counts: (token: string | number | null) => [...userQueryKeys.root(token), "counts"] as const,
  departments: (token: string | number | null) => [...userQueryKeys.options(token), "departments"] as const,
}
