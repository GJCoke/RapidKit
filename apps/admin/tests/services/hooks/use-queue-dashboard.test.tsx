// @vitest-environment jsdom
import { StrictMode, useState, type ReactNode } from "react"
import type { EventEmitter } from "node:events"
import { act, renderHook, render, fireEvent, screen, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
const network = vi.hoisted(() => ({
  sockets: new Map<string, EventEmitter & { connected: boolean; active: boolean }>(),
  connects: [] as string[],
}))
vi.mock("socket.io-client", async () => {
  const { EventEmitter } = await import("node:events")
  class FakeSocket extends EventEmitter {
    constructor(readonly namespace: string) {
      super()
    }
    connected = false
    active = false
    connect() {
      network.connects.push(this.namespace)
      this.connected = true
      this.active = true
      return this
    }
    disconnect() {
      this.connected = false
      this.active = false
      return this
    }
  }
  return {
    Manager: class {
      socket(namespace: string) {
        const socket = network.sockets.get(namespace) ?? new FakeSocket(namespace)
        network.sockets.set(namespace, socket)
        return socket
      }
    },
  }
})
import { getAuthSession } from "@/services/auth-session"
import { resetAppSockets } from "@/services/app-socket"
import { useQueueDashboard } from "@/services/hooks/use-queue-dashboard"
import { queueWorker as worker, queueOverview as overview } from "@test/setup/queue-fixtures"
const base = "http://localhost:16000/api/v1"
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function setup(admin = true) {
  useAuthStore.getState().setToken("access", "queue-session")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      isAdmin: admin,
      roles: [],
      buttons: [],
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  server.use(
    http.get(`${base}/workers/all`, () => reply([worker()])),
    http.get(`${base}/tasks/stats/dashboard`, () => reply(overview())),
    http.get(`${base}/tasks/stats/by-name`, () => reply({ records: [], total: 0, page: 1, pageSize: 10 })),
    http.get(`${base}/tasks/stats/by-worker`, () => reply([])),
  )
  return { client, wrapper }
}
afterEach(() => {
  resetAppSockets()
  network.sockets.clear()
  network.connects.length = 0
  useAuthStore.getState().clearAuth()
})
test("overview and rankings use one coherent day window and changing days hides the previous data", async () => {
  const { wrapper } = setup(),
    calls: unknown[] = []
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(`${base}/tasks/stats/dashboard`, async ({ request }) => {
      const days = Number(new URL(request.url).searchParams.get("days"))
      calls.push(days)
      if (days === 7) await gate
      return reply({ ...overview(), success: days })
    }),
    http.get(`${base}/tasks/stats/by-name`, ({ request }) => {
      calls.push(Object.fromEntries(new URL(request.url).searchParams))
      return reply({ records: [], total: 0, page: 1, pageSize: 10 })
    }),
  )
  const { result } = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(result.current.overview?.success).toBe(1))
  expect(result.current.workers).toHaveLength(1)
  const query = calls.find((value) => typeof value === "object" && value !== null)
  expect(query).toMatchObject({ page: "1", pageSize: "10", sortBy: "total", sortOrder: "desc" })
  act(() => result.current.setDays(7))
  expect(result.current.overview).toBeUndefined()
  await act(async () => {
    release()
  })
  await waitFor(() => expect(result.current.overview?.success).toBe(7))
  expect(calls).toContain(7)
})
test("ranking failures retain successful snapshots and mark partial while overview errors remain independent", async () => {
  const { wrapper } = setup()
  let fail = false
  server.use(
    http.get(`${base}/tasks/stats/by-name`, () =>
      fail
        ? HttpResponse.json({ code: 422, message: "Rank failed", data: null })
        : reply({
            records: [
              {
                taskName: "sample",
                total: 2,
                success: 2,
                failure: 0,
                inProgress: 0,
                successRate: 100,
                lastExecutedAt: "",
                avgRuntime: 1,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 10,
          }),
    ),
  )
  const { result } = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(result.current.tasks).toHaveLength(1))
  fail = true
  await act(async () => {
    await result.current.refresh()
  })
  await waitFor(() => expect(result.current.rankingFailed).toBe(true))
  expect(result.current.tasks[0].taskName).toBe("sample")
  expect(result.current.overview).toBeDefined()
})
test("live worker patches cancel older list snapshots and unknown workers trigger inventory reads", async () => {
  const { wrapper, client } = setup()
  let reads = 0,
    release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(`${base}/workers/all`, async () => {
      if (++reads === 2) await gate
      return reply([worker()])
    }),
  )
  const { result } = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(result.current.workers).toHaveLength(1))
  act(() => {
    void client.invalidateQueries({ predicate: (query) => query.queryKey.includes("workers") })
  })
  await waitFor(() => expect(reads).toBe(2))
  act(() =>
    network.sockets.get("/worker")?.emit("worker:status", {
      hostname: "worker@host",
      status: "1",
      concurrency: 8,
      activeTaskCount: 3,
      processedCount: 20,
      activeQueues: ["critical"],
      lastHeartbeat: new Date().toISOString(),
    }),
  )
  await waitFor(() => expect(result.current.workers[0].concurrency).toBe(8))
  await act(async () => {
    release()
  })
  expect(result.current.workers[0].concurrency).toBe(8)
  act(() =>
    network.sockets.get("/worker")?.emit("worker:status", {
      hostname: "new@host",
      status: "1",
      concurrency: 1,
      activeTaskCount: 0,
      processedCount: 0,
      activeQueues: [],
      lastHeartbeat: new Date().toISOString(),
    }),
  )
  await waitFor(() => expect(reads).toBe(3))
})
test("permission denial avoids reads and sockets, and cleanup drops listeners and retained events", async () => {
  const { wrapper } = setup(false)
  let reads = 0
  server.use(
    http.get(`${base}/workers/all`, () => {
      reads++
      return reply([])
    }),
  )
  const denied = renderHook(useQueueDashboard, { wrapper })
  expect(denied.result.current.workers).toEqual([])
  expect(network.sockets.size).toBe(0)
  expect(reads).toBe(0)
  denied.unmount()
  useAuthStore.setState((state) => ({ userInfo: state.userInfo ? { ...state.userInfo, isAdmin: true } : null }))
  const allowed = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(network.sockets.has("/worker")).toBe(true))
  const socket = network.sockets.get("/worker")
  expect(socket?.listenerCount("worker:status")).toBe(1)
  allowed.unmount()
  expect(socket?.listenerCount("worker:status")).toBe(0)
  expect(socket?.connected).toBe(false)
})
test("bursts during an in-flight statistics read produce exactly one follow-up sample after it settles", async () => {
  const { wrapper } = setup()
  let samples = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/tasks/stats/dashboard`, async () => {
      const sample = ++samples
      if (sample === 2) await gate
      return reply({ ...overview(), success: sample })
    }),
  )
  const { result } = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(result.current.overview?.success).toBe(1))
  let refresh!: Promise<void>
  act(() => {
    refresh = result.current.refresh()
  })
  await waitFor(() => expect(samples).toBe(2))
  act(() => {
    for (let i = 0; i < 3; i++)
      network.sockets.get("/worker")?.emit("task:update", { taskId: `task-${i}`, status: "3" })
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1650))
  })
  expect(samples).toBe(2)
  await act(async () => {
    release()
    await refresh
  })
  await waitFor(() => expect(result.current.overview?.success).toBe(3))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1650))
  })
  expect(samples).toBe(3)
})
test("unmounting cancels a scheduled live refresh and old-account events cannot restart it", async () => {
  const { wrapper } = setup()
  let samples = 0
  server.use(
    http.get(`${base}/tasks/stats/dashboard`, () => {
      samples++
      return reply(overview())
    }),
  )
  const old = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(old.result.current.overview).toBeDefined())
  const socket = network.sockets.get("/worker")
  act(() => socket?.emit("task:update", { taskId: "old", status: "3" }))
  old.unmount()
  useAuthStore.getState().setToken("another-access", "another-queue-session")
  socket?.emit("task:update", { taskId: "late", status: "4" })
  await new Promise((resolve) => setTimeout(resolve, 1650))
  expect(samples).toBe(1)
  expect(socket?.listenerCount("task:update")).toBe(0)
})
test("an unknown worker event during the first inventory read starts a fresh snapshot instead of waiting for polling", async () => {
  const { wrapper } = setup()
  let reads = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/workers/all`, async () => {
      if (++reads === 1) {
        await gate
        return reply([])
      }
      return reply([worker()])
    }),
  )
  const { result } = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(reads).toBe(1))
  act(() =>
    network.sockets.get("/worker")?.emit("worker:status", {
      hostname: "worker@host",
      status: "1",
      concurrency: 4,
      activeTaskCount: 1,
      processedCount: 10,
      activeQueues: ["celery"],
      lastHeartbeat: new Date().toISOString(),
    }),
  )
  await act(async () => {
    release()
  })
  await waitFor(() => expect(result.current.workers).toHaveLength(1))
  expect(reads).toBe(2)
})
test("returning to a previously viewed day window hides cached statistics until its fresh read completes", async () => {
  const { wrapper } = setup()
  let dayOneReads = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/tasks/stats/dashboard`, async ({ request }) => {
      const days = Number(new URL(request.url).searchParams.get("days"))
      if (days === 1 && ++dayOneReads === 2) {
        await gate
        return reply({ ...overview(), success: 11 })
      }
      return reply({ ...overview(), success: days })
    }),
  )
  const { result } = renderHook(useQueueDashboard, { wrapper })
  await waitFor(() => expect(result.current.overview?.success).toBe(1))
  act(() => result.current.setDays(7))
  await waitFor(() => expect(result.current.overview?.success).toBe(7))
  act(() => result.current.setDays(1))
  try {
    expect(result.current.overview).toBeUndefined()
  } finally {
    await act(async () => {
      release()
    })
  }
  await waitFor(() => expect(result.current.overview?.success).toBe(11))
})

test("StrictMode opens the worker namespace once, avoiding a duplicate pending namespace handshake", async () => {
  const { client } = setup()
  function Probe() {
    useQueueDashboard()
    return null
  }
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open dashboard</button>
        {open && <Probe />}
      </>
    )
  }
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    </StrictMode>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }))
  await waitFor(() => expect(client.getQueryData(["queue", getAuthSession(), "workers"])).toHaveLength(1))
  expect(network.connects.filter((namespace) => namespace === "/worker")).toHaveLength(1)
})
