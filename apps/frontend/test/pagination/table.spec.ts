import { afterEach, expect, it, vi } from "vitest"
import { effectScope, nextTick } from "vue"
import type { FlatResponseData } from "@rapidkit/axios"
import { defaultTransform, useNaivePaginatedTable } from "@/hooks/common/table"

vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

const scope = effectScope()
afterEach(() => scope.stop())

it("requests 20 initially, offers all sizes, and resets to page one when selecting 500", async () => {
  const query = { page: 1, pageSize: 20 }
  const api = vi.fn(async () => ({
    data: { records: [], ...query, total: 2000 },
    error: null,
    response: {} as FlatResponseData<unknown, unknown>["response"],
  }))
  const table = scope.run(() =>
    useNaivePaginatedTable({
      api,
      transform: defaultTransform,
      columns: () => [],
      onPaginationParamsChange: (params) => {
        Object.assign(query, params)
      },
    }),
  )!
  expect(table.pagination.pageSize).toBe(20)
  await vi.waitFor(() => expect(table.pagination.itemCount).toBe(2000))
  expect(table.pagination.pageSizes).toEqual([20, 50, 100, 500])
  expect(table.mobilePagination.value.pageSizes).toEqual([20, 50, 100, 500])
  ;(table.pagination.onUpdatePage as (page: number) => void)(3)
  await nextTick()
  await vi.waitFor(() => expect(query.page).toBe(3))
  ;(table.pagination.onUpdatePageSize as (size: number) => void)(500)
  await nextTick()
  await vi.waitFor(() => expect(query).toEqual({ page: 1, pageSize: 500 }))
  expect(api).toHaveBeenCalledTimes(3)
  expect(table.pagination.pageSize).toBe(500)
})
