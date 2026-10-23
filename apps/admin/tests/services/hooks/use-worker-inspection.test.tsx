// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { queueWorkerId } from "@test/setup/queue-fixtures"
import { useWorkerInspection } from "@/services/hooks/use-worker-inspection"
const base = "http://localhost:16000/api/v1/workers",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function setup() {
  useAuthStore.getState().setToken("access", "inspection-session")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: false,
      roles: [],
      buttons: ["worker:read", "task:stats"],
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  return { client, wrapper }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("active and reserved samples are independent, preserve failed refresh snapshots and change only on manual refresh", async () => {
  const { wrapper } = setup()
  let fail = false,
    reads = 0
  server.use(
    http.get(`${base}/:id/tasks/:kind`, ({ params }) => {
      reads++
      return fail && params.kind === "active"
        ? HttpResponse.json({ code: 422, message: "Inspect failed", data: null })
        : reply([{ id: `${params.kind}-one`, name: "sample", args: "[1]", kwargs: "{}" }])
    }),
  )
  const { result, rerender } = renderHook(() => useWorkerInspection(queueWorkerId, true), { wrapper })
  await waitFor(() => expect(result.current.active.rows).toHaveLength(1))
  expect(result.current.reserved.rows).toHaveLength(1)
  expect(result.current.active.sampledAt).not.toBeNull()
  expect(reads).toBe(2)
  rerender()
  expect(reads).toBe(2)
  fail = true
  await act(async () => {
    await result.current.refresh()
  })
  await waitFor(() => expect(result.current.active.failed).toBe(true))
  expect(result.current.active.rows[0].id).toBe("active-one")
  expect(result.current.reserved.failed).toBe(false)
  expect(reads).toBe(4)
})
test("worker switches ignore late inspection replies and offline transitions clear prior samples", async () => {
  const { wrapper } = setup()
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(`${base}/:id/tasks/:kind`, async ({ params }) => {
      calls++
      if (params.id === queueWorkerId) await gate
      return reply([{ id: `${params.id}-${params.kind}`, name: "sample" }])
    }),
  )
  const { result, rerender } = renderHook(({ id, online }) => useWorkerInspection(id, online), {
    wrapper,
    initialProps: { id: queueWorkerId, online: true },
  })
  await waitFor(() => expect(calls).toBe(2))
  rerender({ id: "second-worker", online: true })
  await waitFor(() => expect(result.current.active.rows[0]?.id).toBe("second-worker-active"))
  await act(async () => {
    release()
  })
  expect(result.current.active.rows[0].id).toBe("second-worker-active")
  rerender({ id: "second-worker", online: false })
  expect(result.current.active.rows).toEqual([])
  expect(result.current.active.sampledAt).toBeNull()
  expect(result.current.reserved.rows).toEqual([])
  const before = calls
  await act(async () => {
    await result.current.refresh()
  })
  expect(calls).toBe(before)
  rerender({ id: "second-worker", online: true })
  expect(result.current.active.loading).toBe(false)
  expect(result.current.reserved.loading).toBe(false)
  expect(result.current.active.sampledAt).toBeNull()
  expect(calls).toBe(before)
  await act(async () => {
    await result.current.refresh()
  })
  await waitFor(() => expect(calls).toBe(before + 2))
})
test("retained inspection refresh does not read after unmount or worker-read revocation", async () => {
  const { wrapper } = setup()
  let calls = 0
  server.use(
    http.get(`${base}/:id/tasks/:kind`, () => {
      calls++
      return reply([])
    }),
  )
  const old = renderHook(() => useWorkerInspection(queueWorkerId, true), { wrapper })
  await waitFor(() => expect(calls).toBe(2))
  const refresh = old.result.current.refresh
  useAuthStore.setState((state) => ({ userInfo: state.userInfo ? { ...state.userInfo, buttons: [] } : null }))
  await act(async () => {
    await refresh()
  })
  expect(calls).toBe(2)
  old.unmount()
  await refresh()
  expect(calls).toBe(2)
})

test("React StrictMode effect replay still collects both initial task samples", async () => {
  const { client } = setup()
  server.use(
    http.get(`${base}/:id/tasks/:kind`, ({ params }) =>
      reply([{ id: `${params.kind}-strict`, name: "strict.sample" }]),
    ),
  )
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  )
  const { result } = renderHook(() => useWorkerInspection(queueWorkerId, true), { wrapper })
  await waitFor(() => expect(result.current.active.rows[0]?.id).toBe("active-strict"))
  expect(result.current.reserved.rows[0]?.id).toBe("reserved-strict")
  expect(result.current.active.failed).toBe(false)
  expect(result.current.reserved.failed).toBe(false)
})
