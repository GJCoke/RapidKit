export interface PermissionMatrixRow {
  resource: Api.Permission.CatalogResource
  codes: Api.Permission.CatalogCode[]
}

/** One row per resource in catalog order; the resource's read code comes first. */
export function buildPermissionRows(catalog: Api.Permission.Catalog): PermissionMatrixRow[] {
  const codesByResource = new Map<string, Api.Permission.CatalogCode[]>()
  for (const item of catalog.codes) {
    codesByResource.set(item.resource, [...(codesByResource.get(item.resource) ?? []), item])
  }

  return catalog.resources
    .filter((resource) => codesByResource.has(resource.key))
    .map((resource) => {
      const readCode = `${resource.key}:read`
      const codes = codesByResource.get(resource.key)!
      return {
        resource,
        codes: [...codes.filter((item) => item.code === readCode), ...codes.filter((item) => item.code !== readCode)],
      }
    })
}

/** Codes granted through `depends` (transitively) that were not selected directly, sorted. */
export function expandImpliedCodes(selected: readonly string[], catalog: Api.Permission.Catalog): string[] {
  const dependsOf = new Map(catalog.codes.map((item) => [item.code, item.depends]))
  const chosen = new Set(selected)
  const implied = new Set<string>()
  const queue = [...selected]

  while (queue.length > 0) {
    const current = queue.pop()!
    for (const dependency of dependsOf.get(current) ?? []) {
      if (chosen.has(dependency) || implied.has(dependency)) continue
      implied.add(dependency)
      queue.push(dependency)
    }
  }

  return [...implied].sort()
}

/** Split stored codes into editable ones and residual ones (removed from the catalog or flagged by the server). */
export function splitKnownCodes(
  codes: readonly string[],
  invalidCodes: readonly string[],
  catalog: Api.Permission.Catalog,
): { known: string[]; invalid: string[] } {
  const catalogCodes = new Set(catalog.codes.map((item) => item.code))
  const invalid = new Set(invalidCodes)
  const known: string[] = []

  for (const item of codes) {
    if (catalogCodes.has(item) && !invalid.has(item)) known.push(item)
    else invalid.add(item)
  }

  return { known, invalid: [...invalid].sort() }
}

export function toggleCode(selected: readonly string[], code: string, checked: boolean): string[] {
  const rest = selected.filter((item) => item !== code)
  return checked ? [...rest, code] : rest
}
