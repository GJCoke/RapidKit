// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useApiMonitoring } from "@/services/hooks/use-api-monitoring"
const sockets = vi.hoisted(() => ({
  handlers: new Map<string, Set<(value?: unknown) => void>>(),
  retained: [] as ((value?: unknown) => void)[],
  open: vi.fn(),
  close: vi.fn(),
}))
vi.mock("@/services/app-socket", () => ({
  openAppSocket: sockets.open.mockImplementation(() => ({
    connected: true,
    on: (event: string, handler: (value?: unknown) => void) => {
      const handlers = sockets.handlers.get(event) ?? new Set()
      handlers.add(handler)
      sockets.handlers.set(event, handlers)
      sockets.retained.push(handler)
    },
    off: (event: string, handler: (value?: unknown) => void) => {
      sockets.handlers.get(event)?.delete(handler)
    },
  })),
  closeAppSocket: sockets.close,
}))
const base = "http://localhost:16000/api/v1/system/stats/api",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data }),
  overview = { totalRequests: 100, totalErrors: 2, avgErrorRate: 2, avgMs: 15, busiestCount: 20 },
  metric = (path: string, method = "GET") => ({
    path,
    method,
    requestCount: 10,
    errorCount: 2,
    errorRate: 20,
    avgMs: 5,
    p95Ms: 20,
  }),
  query = { range: "24h", page: 1, pageSize: 20, sortBy: "request_count", sortOrder: "desc" }
function setup(admin = true) {
  useAuthStore.getState().setToken("access", "api-monitoring-session")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: admin,
      roles: [],
      buttons: ["monitoring:read"],
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    requests: string[] = []
  server.use(
    http.get(`${base}/:kind`, ({ request, params }) => {
      requests.push(request.url)
      if (params.kind === "overview") return reply(overview)
      if (params.kind === "list") return reply({ records: [metric("/users")], total: 60, page: 1, pageSize: 20 })
      return reply([])
    }),
  )
  return { client, wrapper, requests }
}
function emit(value: unknown) {
  for (const handler of sockets.handlers.get("dashboard:api_stats") ?? []) handler(value)
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  sockets.handlers.clear()
  sockets.retained = []
  sockets.open.mockClear()
  sockets.close.mockClear()
})
test("overview, two rankings, distribution, trend and list use isolated native queries; list filters never affect summaries", async () => {
  const { wrapper, requests } = setup(false),
    hook = renderHook(() => useApiMonitoring("24h", { ...query, keyword: "users" }, null), { wrapper })
  await waitFor(() => expect(hook.result.current.records).toHaveLength(1))
  await waitFor(() => expect(requests).toHaveLength(6))
  expect(
    requests
      .filter((url) => url.includes("/top?"))
      .map((url) => new URL(url).searchParams.get("sortBy"))
      .sort(),
  ).toEqual(["p95_ms", "requests"])
  for (const url of requests.filter((url) => !url.includes("/list?")))
    expect(new URL(url).searchParams.has("keyword")).toBe(false)
  expect(sockets.open).not.toHaveBeenCalled()
})
test("method filtering loads every legal server page and locally paginates without unsupported query fields or refetching", async () => {
  const { wrapper } = setup(false),
    calls: Record<string, string>[] = []
  server.use(
    http.get(`${base}/list`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams)
      calls.push(params)
      const records =
        params.page === "1"
          ? Array.from({ length: 500 }, (_, index) => metric(`/early-${index}`, index === 0 ? "GET" : "POST"))
          : [metric("/late", "GET")]
      return reply({ records, total: 501, page: Number(params.page), pageSize: 500 })
    }),
  )
  const hook = renderHook(({ page, pageSize }) => useApiMonitoring("24h", { ...query, page, pageSize }, "GET"), {
    wrapper,
    initialProps: { page: 1, pageSize: 1 },
  })
  await waitFor(() => expect(hook.result.current.total).toBe(2))
  expect(hook.result.current.records[0].path).toBe("/early-0")
  hook.rerender({ page: 2, pageSize: 1 })
  expect(hook.result.current.records[0].path).toBe("/late")
  hook.rerender({ page: 1, pageSize: 20 })
  expect(hook.result.current.records).toHaveLength(2)
  expect(calls).toEqual([
    { ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), page: "1", pageSize: "500" },
    { ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), page: "2", pageSize: "500" },
  ])
  for (const call of calls) expect(call).not.toHaveProperty("method")
})
test("late responses from a prior range cannot replace the current overview or rows", async () => {
  const { wrapper } = setup(false)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/overview`, async ({ request }) => {
      if (new URL(request.url).searchParams.get("range") === "1h") await gate
      return reply({ ...overview, totalRequests: new URL(request.url).searchParams.get("range") === "1h" ? 1 : 24 })
    }),
  )
  const hook = renderHook(({ range }: { range: "1h" | "24h" }) => useApiMonitoring(range, { ...query, range }, null), {
    wrapper,
    initialProps: { range: "1h" },
  })
  hook.rerender({ range: "24h" })
  await waitFor(() => expect(hook.result.current.overview?.totalRequests).toBe(24))
  await act(async () => release())
  expect(hook.result.current.overview?.totalRequests).toBe(24)
})
test("initial live events survive the HTTP snapshot and an event during refresh cannot be overwritten by its stale response", async () => {
  const { wrapper } = setup()
  let release!: () => void
  let gate: Promise<void> | null = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/overview`, async () => {
      if (gate) await gate
      return reply(overview)
    }),
  )
  const hook = renderHook(() => useApiMonitoring("24h", query, null), { wrapper })
  await waitFor(() => expect(sockets.open).toHaveBeenCalledWith("/dashboard"))
  act(() => emit({ deltaRequests: 5, deltaErrors: 1, errorRate: 10 }))
  await act(async () => release())
  await waitFor(() => expect(hook.result.current.overview?.totalRequests).toBe(105))
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let refresh!: Promise<unknown>
  act(() => {
    refresh = hook.result.current.refresh()
  })
  await waitFor(() => expect(hook.result.current.queries.overview.isFetching).toBe(true))
  act(() => emit({ deltaRequests: 2, deltaErrors: 1, errorRate: 20 }))
  await waitFor(() => expect(hook.result.current.overview?.totalRequests).toBe(107))
  await act(async () => {
    release()
    await refresh
  })
  expect(hook.result.current.overview).toMatchObject({
    totalRequests: 107,
    totalErrors: 4,
    avgErrorRate: 20,
    avgMs: 15,
  })
  act(() => emit({ deltaRequests: -1, deltaErrors: 0, errorRate: 0 }))
  expect(hook.result.current.overview?.totalRequests).toBe(107)
})
test("permission/session loss and unmount detach realtime listeners and retained old callbacks cannot touch cached data", async () => {
  const { wrapper, client } = setup(),
    hook = renderHook(() => useApiMonitoring("24h", query, null), { wrapper })
  await waitFor(() => expect(hook.result.current.overview?.totalRequests).toBe(100))
  await waitFor(() => expect(sockets.open).toHaveBeenCalled())
  const callbacks = [...sockets.retained]
  hook.unmount()
  expect(sockets.close).toHaveBeenCalledTimes(1)
  expect(sockets.handlers.get("dashboard:api_stats")?.size ?? 0).toBe(0)
  useAuthStore.getState().setToken("other", "other-session")
  const before = JSON.stringify(
    client
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
  )
  act(() => callbacks.forEach((handler) => handler({ deltaRequests: 10, deltaErrors: 0, errorRate: 0 })))
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).toBe(before)
})
