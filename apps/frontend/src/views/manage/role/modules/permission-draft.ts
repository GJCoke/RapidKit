import { computePackageApplyDiff, type RoleGrant } from "./package-apply-diff"
import { expandImpliedCodes } from "./permission-matrix"

export function applyPermissionSelection(
  selected: readonly string[],
  codes: readonly Api.Permission.CatalogCode[],
  mode: "all" | "readonly" | "clear",
): string[] {
  const targets = new Set(codes.map((item) => item.code))
  return [
    ...new Set([
      ...selected.filter((code) => !targets.has(code)),
      ...codes
        .filter((item) => mode === "all" || (mode === "readonly" && item.abacAction === "read"))
        .map((item) => item.code),
    ]),
  ]
}

export function packagesForResource<T extends Pick<Api.PermissionPackage.Package, "codes">>(
  packages: T[],
  resource: string,
): T[] {
  return packages.filter((p) => p.codes.length > 0 && p.codes.every((code) => code.startsWith(`${resource}:`)))
}

export function diffPermissionDraft(before: RoleGrant, after: RoleGrant, catalog: Api.Permission.Catalog) {
  const diff = computePackageApplyDiff(
    before,
    [{ codes: after.permissionCodes, dataScopes: after.dataScopes, fieldModes: after.fieldModes }],
    "replace",
  )
  const oldImplied = new Set(expandImpliedCodes(before.permissionCodes, catalog))
  const newImplied = new Set(expandImpliedCodes(after.permissionCodes, catalog))
  return {
    ...diff,
    addedImplied: [...newImplied].filter((code) => !oldImplied.has(code)),
    removedImplied: [...oldImplied].filter((code) => !newImplied.has(code)),
  }
}

/** A comparison of direct operations, never a persisted relationship. */
export function matchingResourcePackage(
  codes: readonly string[],
  resource: string,
  packages: Api.PermissionPackage.Package[],
) {
  const direct = new Set(codes.filter((code) => code.startsWith(`${resource}:`)))
  return packagesForResource(packages, resource).find(
    (p) => direct.size === new Set(p.codes).size && p.codes.every((code) => direct.has(code)),
  )
}

export type PermissionDraftDiff = ReturnType<typeof diffPermissionDraft>
