// apps/frontend/test/table-actions/table-integration.spec.ts
import { effectScope, nextTick, ref } from "vue"
import { expect, it, vi } from "vitest"
import { useNaivePaginatedTable } from "@/hooks/common/table"

const mobile = ref(false)
vi.mock("@/store/modules/app", () => ({
  useAppStore: () => ({
    locale: "zh-CN",
    get isMobile() {
      return mobile.value
    },
  }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

it("removes and restores a conditional column without ghosts or lost preferences", async () => {
  const scope = effectScope()
  const allowed = ref(true)
  try {
    const table = scope.run(() =>
      useNaivePaginatedTable({
        immediate: false,
        api: async () => [],
        transform: () => ({ data: [], pageNum: 1, pageSize: 20, total: 0 }),
        columns: () => [
          { type: "selection" as const, width: 48 },
          { key: "name", title: "Name", minWidth: 100 },
          ...(allowed.value ? [{ key: "operate", title: "Actions", width: 80 }] : []),
        ],
      }),
    )!
    const operation = table.columnChecks.value.find((item) => item.key === "operate")!
    operation.fixed = "right"
    expect(table.scrollX.value).toBe(228)
    allowed.value = false
    await nextTick()
    expect(table.columnChecks.value.some((item) => item.key === "operate")).toBe(false)
    expect(table.columns.value).toHaveLength(2)
    expect(table.scrollX.value).toBe(148)
    table.reloadColumns()
    expect(table.columns.value).toHaveLength(2)
    allowed.value = true
    await nextTick()
    expect(table.columnChecks.value.find((item) => item.key === "operate")?.fixed).toBe("right")
    expect(table.columns.value).toHaveLength(3)
    mobile.value = true
    expect(table.columns.value.at(-1)?.fixed).toBeUndefined()
    expect(table.columnChecks.value.find((item) => item.key === "operate")?.fixed).toBe("right")
    mobile.value = false
    expect(table.columns.value.at(-1)?.fixed).toBe("right")
  } finally {
    scope.stop()
  }
})
