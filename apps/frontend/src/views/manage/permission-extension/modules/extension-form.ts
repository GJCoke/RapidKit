export interface ExtensionForm {
  kind: Api.PermissionExtension.Kind
  code: string
  routeKey: string
  dependsOn: string
  resource: string
  label: string
  abacAction: "read" | "write"
  note: string
}

export function createEmptyExtensionForm(): ExtensionForm {
  return {
    kind: "route_binding",
    code: "",
    routeKey: "",
    dependsOn: "",
    resource: "",
    label: "",
    abacAction: "read",
    note: "",
  }
}

export function isExtensionFormComplete(form: ExtensionForm): boolean {
  if (!form.code) return false
  if (form.kind === "route_binding") return Boolean(form.routeKey)
  if (form.kind === "depends") return Boolean(form.dependsOn)
  return Boolean(form.resource && form.label && form.abacAction)
}

export function buildExtensionPayload(form: ExtensionForm): Api.PermissionExtension.ExtensionCreate {
  const base = { kind: form.kind, code: form.code.trim() }
  if (form.kind === "route_binding") return { ...base, routeKey: form.routeKey, note: form.note }
  if (form.kind === "depends") return { ...base, dependsOn: form.dependsOn, note: form.note }
  return { ...base, resource: form.resource, label: form.label.trim(), abacAction: form.abacAction, note: form.note }
}

export function extensionStatusTagType(status: Api.PermissionExtension.Status): NaiveUI.ThemeColor {
  if (status === "active") return "success"
  if (status === "cleanable") return "warning"
  return "error"
}
