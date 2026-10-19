import { effectScope, ref } from "vue"
import { expect, it, vi } from "vitest"
import { useOperationAccess } from "@/hooks/business/table-actions/use-operation-access"
const permitted = ref(true)
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => permitted.value }) }))

it("closes an edit surface when its permission is revoked", () => {
  permitted.value = true
  const scope = effectScope()
  const visible = ref(true)
  try {
    const access = scope.run(() => useOperationAccess(() => "user:update", visible))!
    expect(access.value).toBe(true)
    permitted.value = false
    expect(access.value).toBe(false)
    expect(visible.value).toBe(false)
    visible.value = true
    expect(visible.value).toBe(false)
  } finally {
    scope.stop()
  }
})

it("keeps business eligibility independent of administrator permission bypass", () => {
  permitted.value = true
  const eligible = ref(false)
  const scope = effectScope()
  try {
    const access = scope.run(() =>
      useOperationAccess(
        () => "user:reset-password",
        undefined,
        () => eligible.value,
      ),
    )!
    expect(access.value).toBe(false)
    eligible.value = true
    expect(access.value).toBe(true)
  } finally {
    scope.stop()
  }
})
