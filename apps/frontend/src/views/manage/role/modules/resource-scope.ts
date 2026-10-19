// apps/frontend/src/views/manage/role/modules/resource-scope.ts
export type FieldModeValue = "visible" | "masked" | "hidden"
export type RestrictedFieldMode = Exclude<FieldModeValue, "visible">
export type DataScopes = Record<string, string>
export type FieldModes = Record<string, Record<string, FieldModeValue>>

export interface ScopeOption {
  key: string
  label: string
}

export interface ScopeFieldGroup {
  key: string
  label: string
  fields: string[]
  modes: RestrictedFieldMode[]
}

/** Structural subset of Api.Permission.CatalogResource used by scope editors. */
export interface ScopeResource {
  key: string
  label: string
  dataScopes: ScopeOption[]
  fieldGroups: ScopeFieldGroup[]
}

export interface InvalidScope {
  resource: string
  group?: string | null
  stored: string
  effective: string
}

export const ALL_SCOPE = "all"
export const VISIBLE: FieldModeValue = "visible"

export function hasScopeControls(resource: ScopeResource): boolean {
  return resource.dataScopes.length > 0 || resource.fieldGroups.length > 0
}

export function dataScopeOptions(resource: ScopeResource, allLabel: string) {
  return [
    { label: allLabel, value: ALL_SCOPE },
    ...resource.dataScopes.map((item) => ({ label: item.label, value: item.key })),
  ]
}

export function fieldModeOptions(group: ScopeFieldGroup, labels: Record<FieldModeValue, string>) {
  return [VISIBLE, ...group.modes].map((mode) => ({ label: labels[mode], value: mode }))
}

export function getDataScope(scopes: DataScopes, resource: string): string {
  return scopes[resource] ?? ALL_SCOPE
}

/** Returns a new map; "all" is the default and is not stored. */
export function setDataScope(
  scopes: DataScopes,
  resource: string,
  value: string,
  preserveDefaults = false,
): DataScopes {
  const next = { ...scopes }
  if (value === ALL_SCOPE && !preserveDefaults) delete next[resource]
  else next[resource] = value
  return next
}

export function getFieldMode(modes: FieldModes, resource: string, group: string): FieldModeValue {
  return modes[resource]?.[group] ?? VISIBLE
}

/** Returns a new map; "visible" is the default and is not stored. */
export function setFieldMode(
  modes: FieldModes,
  resource: string,
  group: string,
  value: FieldModeValue,
  preserveDefaults = false,
): FieldModes {
  const groups = { ...modes[resource] }
  if (value === VISIBLE && !preserveDefaults) delete groups[group]
  else groups[group] = value
  const next = { ...modes }
  if (Object.keys(groups).length > 0) next[resource] = groups
  else delete next[resource]
  return next
}

export function invalidScopeKey(resource: string, group?: string | null): string {
  return group ? `${resource}.${group}` : resource
}

export function invalidScopeKeys(items: readonly InvalidScope[]): Set<string> {
  return new Set(items.map((item) => invalidScopeKey(item.resource, item.group)))
}

/** Resources referenced by the given codes that declare data scopes or field groups, in catalog order. */
export function resourcesForCodes(codes: readonly string[], resources: readonly ScopeResource[]): ScopeResource[] {
  const keys = new Set(codes.map((code) => code.split(":")[0]))
  return resources.filter((resource) => keys.has(resource.key) && hasScopeControls(resource))
}
