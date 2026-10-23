// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useAuditDetail, useAuditLogs } from "@/services/hooks/use-audit-log"
const base = "http://localhost:16000/api/v1/system/audit-logs"
function setup() {
  useAuthStore.getState().setToken("first", "refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      name: "Admin",
      username: "admin",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: true,
      buttons: [],
      roles: [],
    },
  })
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("audit detail keeps not found distinct from request failure and retries errors", async () => {
  let failed = true
  server.use(
    http.get(`${base}/event`, () =>
      HttpResponse.json(failed ? { code: 500, message: "Unavailable", data: null } : { code: 0, data: null }),
    ),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => useAuditDetail("event"), { wrapper })
  await waitFor(() => expect(result.current.isError).toBe(true))
  failed = false
  await act(() => result.current.refetch())
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toBeNull()
})
test("late audit detail from a previous identity cannot replace the current identity result", async () => {
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/event`, async () => {
      const first = ++calls === 1
      if (first) await gate
      return HttpResponse.json({ code: 0, data: { id: "event", actorName: first ? "Old private" : "Current" } })
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => useAuditDetail("event"), { wrapper })
  await waitFor(() => expect(calls).toBe(1))
  act(() => useAuthStore.getState().setToken("second", "second-refresh"))
  await waitFor(() => expect(result.current.data?.actorName).toBe("Current"))
  await act(async () => {
    release()
    await gate
  })
  expect(result.current.data?.actorName).toBe("Current")
})
test("new applied filters do not display the previous filter's records while waiting", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/paginate`, async ({ request }) => {
      const keyword = new URL(request.url).searchParams.get("keyword")
      if (keyword === "new") await gate
      return HttpResponse.json({ code: 0, data: { records: [{ id: keyword }], page: 1, pageSize: 20, total: 1 } })
    }),
  )
  const { wrapper } = setup()
  const { result, rerender } = renderHook(({ keyword }) => useAuditLogs({ keyword }), {
    wrapper,
    initialProps: { keyword: "old" },
  })
  await waitFor(() => expect(result.current.data?.records[0].id).toBe("old"))
  rerender({ keyword: "new" })
  expect(result.current.data).toBeUndefined()
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() => expect(result.current.data?.records[0].id).toBe("new"))
})
