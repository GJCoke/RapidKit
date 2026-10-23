// @vitest-environment jsdom
import type { ReactNode } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { expect, test } from "vitest"
import { createTestQueryClient } from "@test/setup/render"
import { usePaginatedTable } from "@/shared/data-table"
test("existing table callers retain the application's cache policy when no freshness override is supplied", async () => {
  const client = createTestQueryClient()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 300_000 } })
  let name = "Original",
    calls = 0
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const observe = () =>
    usePaginatedTable({
      queryKey: ["compatibility"],
      queryFn: async () => {
        calls++
        return { records: [{ id: "one", name }], page: 1, pageSize: 10, total: 1 }
      },
    })
  const first = renderHook(observe, { wrapper })
  await waitFor(() => expect(first.result.current.tableData.records[0]?.name).toBe("Original"))
  first.unmount()
  name = "Changed"
  const second = renderHook(observe, { wrapper })
  await waitFor(() => expect(second.result.current.query.isFetching).toBe(false))
  expect(calls).toBe(1)
  expect(second.result.current.tableData.records[0]?.name).toBe("Original")
})
