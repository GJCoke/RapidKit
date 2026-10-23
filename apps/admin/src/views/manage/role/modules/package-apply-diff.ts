import { ALL_SCOPE, VISIBLE, type DataScopes, type FieldModes } from "./resource-scope"

export interface RoleGrant {
  permissionCodes: string[]
  dataScopes: DataScopes
  fieldModes: FieldModes
}

export interface PackageGrant {
  codes: string[]
  dataScopes: DataScopes
  fieldModes: FieldModes
}

export interface ScopeChange {
  resource: string
  group: string | null
  before: string
  after: string
}

export interface PackageApplyDiff {
  next: RoleGrant
  addedCodes: string[]
  removedCodes: string[]
  scopeChanges: ScopeChange[]
  hasChanges: boolean
}

function unique(items: Iterable<string>) {
  return [...new Set(items)]
}

function missingFrom(source: string[], target: string[]) {
  const targetSet = new Set(target)
  return source.filter((item) => !targetSet.has(item))
}

function mergeFieldModes(target: FieldModes, source: FieldModes): FieldModes {
  const next: FieldModes = { ...target }
  for (const [resource, groups] of Object.entries(source)) next[resource] = { ...next[resource], ...groups }
  return next
}

function diffScopes(before: RoleGrant, after: RoleGrant): ScopeChange[] {
  const changes: ScopeChange[] = []
  for (const resource of unique([...Object.keys(before.dataScopes), ...Object.keys(after.dataScopes)])) {
    const old = before.dataScopes[resource] ?? ALL_SCOPE
    const next = after.dataScopes[resource] ?? ALL_SCOPE
    if (old !== next) changes.push({ resource, group: null, before: old, after: next })
  }
  for (const resource of unique([...Object.keys(before.fieldModes), ...Object.keys(after.fieldModes)])) {
    const oldGroups = before.fieldModes[resource] ?? {}
    const newGroups = after.fieldModes[resource] ?? {}
    for (const group of unique([...Object.keys(oldGroups), ...Object.keys(newGroups)])) {
      const old = oldGroups[group] ?? VISIBLE
      const next = newGroups[group] ?? VISIBLE
      if (old !== next) changes.push({ resource, group, before: old, after: next })
    }
  }
  return changes
}

/** Mirror of backend merge_grants/diff_grants for previewing an apply operation. */
export function computePackageApplyDiff(
  current: RoleGrant,
  packages: PackageGrant[],
  mode: "merge" | "replace",
): PackageApplyDiff {
  const base: RoleGrant = mode === "merge" ? current : { permissionCodes: [], dataScopes: {}, fieldModes: {} }
  let dataScopes: DataScopes = { ...base.dataScopes }
  let fieldModes: FieldModes = mergeFieldModes({}, base.fieldModes)
  for (const item of packages) {
    dataScopes = { ...dataScopes, ...item.dataScopes }
    fieldModes = mergeFieldModes(fieldModes, item.fieldModes)
  }
  dataScopes = Object.fromEntries(Object.entries(dataScopes).filter(([, value]) => value !== ALL_SCOPE))
  fieldModes = Object.fromEntries(
    Object.entries(fieldModes)
      .map(
        ([resource, groups]) =>
          [resource, Object.fromEntries(Object.entries(groups).filter(([, value]) => value !== VISIBLE))] as const,
      )
      .filter(([, groups]) => Object.keys(groups).length > 0),
  )
  const next: RoleGrant = {
    permissionCodes: unique([...base.permissionCodes, ...packages.flatMap((item) => item.codes)]),
    dataScopes,
    fieldModes,
  }
  const addedCodes = missingFrom(next.permissionCodes, current.permissionCodes)
  const removedCodes = missingFrom(current.permissionCodes, next.permissionCodes)
  const scopeChanges = diffScopes(current, next)
  return {
    next,
    addedCodes,
    removedCodes,
    scopeChanges,
    hasChanges: addedCodes.length + removedCodes.length + scopeChanges.length > 0,
  }
}

export function formatScopeChange(change: ScopeChange): string {
  const target = change.group ? `${change.resource}.${change.group}` : change.resource
  return `${target}: ${change.before} → ${change.after}`
}
