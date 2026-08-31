export type HomePermissionState = "loading" | "dashboard" | "restricted" | "unavailable"

export function resolvePermissionState(
  knownModules: readonly string[],
  allowedModules: readonly string[],
): Extract<HomePermissionState, "dashboard" | "restricted"> {
  const known = new Set(knownModules)
  return allowedModules.some(key => known.has(key)) ? "dashboard" : "restricted"
}
