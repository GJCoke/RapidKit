export type DashboardModuleKey = string

export type DashboardModuleDefinition = {
  key: DashboardModuleKey
  order: number
}

export function selectDashboardModules<T extends DashboardModuleDefinition>(
  registry: readonly T[],
  allowedModules: readonly string[],
): T[] {
  const keys = new Set<string>()
  for (const definition of registry) {
    if (keys.has(definition.key)) {
      throw new Error(`duplicate dashboard module key: ${definition.key}`)
    }
    keys.add(definition.key)
  }

  const allowed = new Set(allowedModules)
  return registry.filter((definition) => allowed.has(definition.key)).toSorted((a, b) => a.order - b.order)
}
