import { describe, expect, it } from "vitest"
import {
  buildExtensionPayload,
  createEmptyExtensionForm,
  extensionStatusTagType,
  isExtensionFormComplete,
} from "@/views/manage/permission-extension/modules/extension-form"

describe("extension form", () => {
  it("builds a route binding payload with only relevant fields", () => {
    const form = {
      ...createEmptyExtensionForm(),
      kind: "route_binding" as const,
      code: "user:update",
      routeKey: "GET:/api/v1/positions/all",
      dependsOn: "ignored:read",
      note: "补岗位下拉",
    }
    expect(buildExtensionPayload(form)).toEqual({
      kind: "route_binding",
      code: "user:update",
      routeKey: "GET:/api/v1/positions/all",
      note: "补岗位下拉",
    })
  })

  it("builds a custom code payload", () => {
    const form = {
      ...createEmptyExtensionForm(),
      kind: "custom_code" as const,
      code: "user:audit",
      resource: "user",
      label: "审计用户",
      abacAction: "read" as const,
    }
    expect(buildExtensionPayload(form)).toEqual({
      kind: "custom_code",
      code: "user:audit",
      resource: "user",
      label: "审计用户",
      abacAction: "read",
      note: "",
    })
  })

  it("checks completeness per kind", () => {
    const empty = createEmptyExtensionForm()
    expect(isExtensionFormComplete({ ...empty, kind: "depends", code: "user:update" })).toBe(false)
    expect(
      isExtensionFormComplete({ ...empty, kind: "depends", code: "user:update", dependsOn: "position:read" }),
    ).toBe(true)
    expect(isExtensionFormComplete({ ...empty, kind: "custom_code", code: "user:audit", resource: "user" })).toBe(false)
  })

  it("maps status to tag types", () => {
    expect(extensionStatusTagType("active")).toBe("success")
    expect(extensionStatusTagType("cleanable")).toBe("warning")
    expect(extensionStatusTagType("invalid")).toBe("error")
  })
})
