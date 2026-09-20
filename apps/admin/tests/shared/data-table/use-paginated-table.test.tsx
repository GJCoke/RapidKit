// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { expect, test, vi } from "vitest"
import { usePaginatedTable } from "@/shared/data-table/use-paginated-table"

test("pagination changes trigger the query and preserve the flat response", async () => {
  const queryFn = vi.fn(async ({ page, pageSize }: { page: number; pageSize: number }) => ({
    records: [{ id: `${page}` }],
    page,
    pageSize,
    total: 30,
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => usePaginatedTable({ queryKey: ["fixture"], queryFn }), { wrapper })
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true))
  expect(result.current.tableData.records).toEqual([{ id: "1" }])
  act(() => result.current.setPage(2))
  await waitFor(() => expect(queryFn).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 }))
})
