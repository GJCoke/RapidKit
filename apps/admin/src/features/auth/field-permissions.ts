import type { ApiResponse } from "@/typings/service"

export type RestrictedFields = ApiResponse<"/api/v1/auth/user/info">["restrictedFields"]

export function restrictedFieldsFor(fields: RestrictedFields | undefined, resource: string): ReadonlySet<string> {
  return new Set(
    Object.keys(fields?.[resource] ?? {}).map((key) =>
      key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()),
    ),
  )
}

export function omitRestrictedFields<T extends Record<string, unknown>>(
  payload: T,
  restricted: ReadonlySet<string>,
): Partial<T> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !restricted.has(key))) as Partial<T>
}
