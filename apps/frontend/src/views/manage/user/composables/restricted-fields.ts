// apps/frontend/src/views/manage/user/composables/restricted-fields.ts
export type RestrictedFieldMode = "masked" | "hidden"
export type RestrictedFields = Record<string, Record<string, RestrictedFieldMode>>

function toCamel(field: string) {
  return field.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

/** Form keys of user fields the current role may not read in clear text or modify. */
export function restrictedUserFields(restricted: RestrictedFields | undefined): Set<string> {
  return new Set(Object.keys(restricted?.user ?? {}).map(toCamel))
}

export function omitRestricted<T extends Record<string, unknown>>(payload: T, restricted: Set<string>): Partial<T> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !restricted.has(key))) as Partial<T>
}
