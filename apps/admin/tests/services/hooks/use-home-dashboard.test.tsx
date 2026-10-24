// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider, onlineManager, focusManager } from "@tanstack/react-query"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import * as dashboardApi from "@/services/api/dashboard"
import { getAuthSession } from "@/services/auth-session"
const stream = vi.hoisted(() => ({
  handlers: new Map<string, (value: unknown) => void>(),
  opens: [] as string[],
  closes: 0,
}))
vi.mock("@/services/app-socket", () => ({
  openAppSocket: (namespace: string) => {
    stream.opens.push(namespace)
    return {
      connected: false,
      on: (event: string, handler: (value: unknown) => void) => stream.handlers.set(event, handler),
      off: (event: string) => stream.handlers.delete(event),
    }
  },
  closeAppSocket: () => {
    stream.closes++
  },
  resetAppSockets: () => {},
}))
import {
  homeKeys,
  useHomeCapabilities,
  useHomeOverview,
  useHomeActivities,
  useHomeContacts,
  useHomeResources,
  useHomeApi,
  useHomeLive,
  useHomeRefresh,
} from "@/services/hooks/use-home-dashboard"
const base = "http://localhost:16000/api/v1"
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
const activity = (id: string, category = "task") => ({
  id,
  category,
  level: "success",
  eventCode: "task.done",
  subjectType: "task",
  titleKey: "page.home.dashboard.activity.taskSucceeded",
  titleParams: { task: id },
  occurredAt: "2026-10-24T00:00:00Z",
})
const resource = (hostname: string, cpuPercent: number) => ({
  hostname,
  cpuPercent,
  memoryUsed: 10,
  memoryTotal: 100,
  memoryPercent: 10,
  diskUsed: 20,
  diskTotal: 100,
  diskPercent: 20,
  netSent: 0,
  netRecv: 0,
})
function setup(allowed = ["dashboard.overview"], admin = true) {
  useAuthStore.getState().setToken("access", "home-session")
  useAuthStore.setState({
    userInfo: {
      id: "actor",
      username: "actor",
      name: "Actor",
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
      <StrictMode>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </StrictMode>
    )
  server.use(http.get(`${base}/dashboard/capabilities`, () => reply({ allowedModules: allowed, revision: "revision" })))
  return { client, wrapper }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  stream.handlers.clear()
  stream.opens.length = 0
  stream.closes = 0
  vi.restoreAllMocks()
  onlineManager.setOnline(true)
  focusManager.setFocused(undefined)
})

test("capabilities fail closed and retry permits only the granted resource; revocation masks cache and guards manual refetch", async () => {
  const { client, wrapper } = setup()
  let reads = 0
  server.use(
    http.get(`${base}/dashboard/capabilities`, () => HttpResponse.json({ code: 15001, data: null })),
    http.get(`${base}/system/stats/operations-overview`, () => {
      reads++
      return reply({ marker: "overview" })
    }),
  )
  const hook = renderHook(() => ({ caps: useHomeCapabilities(), overview: useHomeOverview() }), { wrapper })
  await waitFor(() => expect(hook.result.current.caps.isError).toBe(true))
  await act(async () => {
    await hook.result.current.overview.refetch()
  })
  expect(reads).toBe(0)
  server.use(
    http.get(`${base}/dashboard/capabilities`, () =>
      reply({ allowedModules: ["dashboard.overview"], revision: "next" }),
    ),
  )
  await act(async () => {
    await hook.result.current.caps.refetch()
  })
  await waitFor(() => expect(hook.result.current.overview.data).toEqual({ marker: "overview" }))
  act(() =>
    client.setQueryData(homeKeys.capabilities(getAuthSession()), {
      data: { allowedModules: [], revision: "revoked" },
      error: null,
    }),
  )
  await waitFor(() => expect(hook.result.current.overview.data).toBeUndefined())
  await act(async () => {
    await hook.result.current.overview.refetch()
  })
  expect(reads).toBe(1)
})
test("activity categories use separate queries and repeated contract parameters, without previous-filter data", async () => {
  const { wrapper } = setup(["dashboard.activity"])
  const seen: string[][] = []
  server.use(
    http.get(`${base}/system/activities`, ({ request }) => {
      const categories = new URL(request.url).searchParams.getAll("categories")
      seen.push(categories)
      return reply({ items: [activity(categories[0] || "all", categories[0] || "task")], size: 20, nextCursor: null })
    }),
  )
  const hook = renderHook(({ category }: { category: "all" | "user" }) => useHomeActivities(category), {
    wrapper,
    initialProps: { category: "all" },
  })
  await waitFor(() => expect(hook.result.current.data?.items[0].id).toBe("all"))
  hook.rerender({ category: "user" })
  expect(hook.result.current.data).toBeUndefined()
  await waitFor(() => expect(hook.result.current.data?.items[0].id).toBe("user"))
  expect(seen).toEqual([[], ["user"]])
})
test("a late owned request cannot expose a previous identity and manual retry cannot send as its replacement", async () => {
  const { wrapper } = setup()
  let release!: () => void,
    started = false,
    reads = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/system/stats/operations-overview`, async () => {
      reads++
      started = true
      await gate
      return reply({ marker: "old-private" })
    }),
  )
  const hook = renderHook(() => useHomeOverview(), { wrapper })
  await waitFor(() => expect(started).toBe(true))
  act(() => useAuthStore.getState().setToken("next", "next-session"))
  await act(async () => {
    release()
  })
  expect(hook.result.current.data).toBeUndefined()
  await act(async () => {
    await hook.result.current.refetch()
  })
  expect(reads).toBe(1)
})
test("restricted contacts load only without known capabilities; normal module access never reads contacts", async () => {
  const { client, wrapper } = setup(["dashboard.trends"], false)
  let reads = 0
  server.use(
    http.get(`${base}/users/admin-contacts`, () => {
      reads++
      return reply([{ id: "a", name: "Admin", email: "admin@example.test" }])
    }),
  )
  const hook = renderHook(() => useHomeContacts(), { wrapper })
  await waitFor(() => expect(hook.result.current.data).toHaveLength(1))
  act(() =>
    client.setQueryData(homeKeys.capabilities(getAuthSession()), {
      data: { allowedModules: ["dashboard.business"], revision: "granted" },
      error: null,
    }),
  )
  await waitFor(() => expect(hook.result.current.data).toBeUndefined())
  await act(async () => {
    await hook.result.current.refetch()
  })
  expect(reads).toBe(1)
})
test("admin stream updates instances, filtered activities and empty API failures; malformed and unmounted events are ignored", async () => {
  const { wrapper } = setup(["dashboard.infrastructure", "dashboard.activity", "dashboard.api-monitoring"])
  server.use(
    http.get(`${base}/system/stats/resources`, () =>
      reply({ instances: [resource("a", 1)], summary: resource("summary", 1) }),
    ),
    http.get(`${base}/system/activities`, () => reply({ items: [activity("old")], size: 20, nextCursor: null })),
    http.get(`${base}/system/stats/api/top`, () =>
      reply([{ path: "/old", method: "GET", requestCount: 1, errorCount: 1, errorRate: 100, avgMs: 1, p95Ms: 1 }]),
    ),
    http.get(`${base}/system/stats/api/distribution`, () => reply([])),
    http.get(`${base}/system/stats/api/trend`, () => reply([])),
  )
  const hook = renderHook(
    () => {
      useHomeLive()
      return { resources: useHomeResources(), activity: useHomeActivities("task"), api: useHomeApi() }
    },
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.api.top.data).toHaveLength(1))
  expect(stream.opens).toEqual(["/dashboard"])
  await act(async () => {
    stream.handlers.get("dashboard:resources")?.(resource("b", 99))
    stream.handlers.get("dashboard:activity.created")?.(activity("new"))
    stream.handlers.get("dashboard:api_stats")?.({ topFailures: [] })
  })
  await waitFor(() => expect(hook.result.current.resources.data?.instances).toHaveLength(2))
  expect(hook.result.current.resources.data?.summary.cpuPercent).toBe(50)
  expect(hook.result.current.activity.data?.items.map((x) => x.id)).toEqual(["new", "old"])
  expect(hook.result.current.api.top.data).toEqual([])
  await act(async () => {
    stream.handlers.get("dashboard:activity.created")?.(activity("other", "user"))
    stream.handlers.get("dashboard:resources")?.({ hostname: "bad" })
  })
  expect(hook.result.current.activity.data?.items).toHaveLength(2)
  expect(hook.result.current.resources.data?.instances).toHaveLength(2)
  hook.unmount()
  expect(stream.handlers.size).toBe(0)
  expect(stream.closes).toBe(1)
})
test("ordinary accounts and unknown-only capability lists never open the admin namespace", async () => {
  const { wrapper } = setup(["dashboard.overview"], false)
  const hook = renderHook(
    () => {
      useHomeLive()
      return useHomeCapabilities()
    },
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  expect(stream.opens).toEqual([])
})

test("refresh resolves current capabilities before requesting module data after access is revoked", async () => {
  const { wrapper } = setup()
  let allowed = true,
    reads = 0
  server.use(
    http.get(`${base}/dashboard/capabilities`, () =>
      reply({ allowedModules: allowed ? ["dashboard.overview"] : [], revision: allowed ? "old" : "new" }),
    ),
    http.get(`${base}/system/stats/operations-overview`, () => {
      reads++
      return reply({ marker: "private" })
    }),
  )
  const hook = renderHook(() => ({ overview: useHomeOverview(), refresh: useHomeRefresh() }), { wrapper })
  await waitFor(() => expect(hook.result.current.overview.data).toEqual({ marker: "private" }))
  allowed = false
  await act(async () => {
    await hook.result.current.refresh()
  })
  await waitFor(() => expect(hook.result.current.overview.data).toBeUndefined())
  expect(reads).toBe(1)
})

test("the first socket connection keeps initial HTTP requests single; reconnect refreshes capabilities then data", async () => {
  const { wrapper } = setup()
  let reads = 0
  const capabilities = vi.spyOn(dashboardApi, "fetchDashboardCapabilities")
  server.use(
    http.get(`${base}/system/stats/operations-overview`, () => {
      reads++
      return reply({ marker: "live" })
    }),
  )
  const hook = renderHook(
    () => {
      useHomeLive()
      return useHomeOverview()
    },
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.data).toEqual({ marker: "live" }))
  expect(capabilities).toHaveBeenCalledTimes(1)
  await act(async () => {
    stream.handlers.get("connect")?.(undefined)
  })
  expect(capabilities).toHaveBeenCalledTimes(1)
  expect(reads).toBe(1)
  await act(async () => {
    stream.handlers.get("connect")?.(undefined)
  })
  await waitFor(() => expect(reads).toBe(2))
  expect(capabilities).toHaveBeenCalledTimes(2)
})

test.each(["online", "focus"])(
  "automatic %s recovery waits for current capabilities before retrying module queries",
  async (event) => {
    const { wrapper } = setup()
    const operations = vi.spyOn(dashboardApi, "fetchOperationsOverview")
    let attempts = 0,
      started!: () => void,
      release!: () => void
    const ready = new Promise<void>((resolve) => {
        started = resolve
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
    server.use(
      http.get(`${base}/dashboard/capabilities`, async () => {
        attempts++
        if (attempts > 1) {
          started()
          await gate
        }
        return reply({ allowedModules: attempts > 1 ? [] : ["dashboard.overview"], revision: String(attempts) })
      }),
      http.get(`${base}/system/stats/operations-overview`, () => reply({ marker: "private" })),
    )
    const hook = renderHook(
      () => {
        useHomeLive()
        return useHomeOverview()
      },
      { wrapper },
    )
    await waitFor(() => expect(hook.result.current.data).toEqual({ marker: "private" }))
    expect(operations).toHaveBeenCalledTimes(1)
    act(() => {
      if (event === "online") onlineManager.setOnline(false)
      else focusManager.setFocused(false)
    })
    act(() => {
      if (event === "online") onlineManager.setOnline(true)
      else focusManager.setFocused(true)
      window.dispatchEvent(new Event(event))
    })
    await ready
    try {
      expect(operations).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
    await waitFor(() => expect(hook.result.current.data).toBeUndefined())
    expect(operations).toHaveBeenCalledTimes(1)
    expect(attempts).toBe(2)
  },
)

test("overlapping online, focus and explicit refresh share a single capability check and one module refresh", async () => {
  const { wrapper } = setup()
  let attempts = 0,
    reads = 0,
    started!: () => void,
    release!: () => void
  const ready = new Promise<void>((resolve) => {
      started = resolve
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
  server.use(
    http.get(`${base}/dashboard/capabilities`, async () => {
      attempts++
      if (attempts > 1) {
        started()
        await gate
      }
      return reply({ allowedModules: ["dashboard.overview"], revision: String(attempts) })
    }),
    http.get(`${base}/system/stats/operations-overview`, () => {
      reads++
      return reply({ marker: "private" })
    }),
  )
  const hook = renderHook(
    () => {
      useHomeLive()
      return { overview: useHomeOverview(), refresh: useHomeRefresh() }
    },
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.overview.data).toEqual({ marker: "private" }))
  let pending!: Promise<void>
  act(() => {
    window.dispatchEvent(new Event("online"))
    window.dispatchEvent(new Event("focus"))
    pending = hook.result.current.refresh()
  })
  await ready
  try {
    expect(attempts).toBe(2)
    expect(reads).toBe(1)
  } finally {
    release()
  }
  await act(async () => {
    await pending
  })
  expect(attempts).toBe(2)
  expect(reads).toBe(2)
})

test.each(["paused category", "manual retry"])(
  "%s waits for an in-flight capability refresh before sending a module request",
  async (trigger) => {
    const { wrapper } = setup(["dashboard.activity"])
    const request = vi.spyOn(dashboardApi, "fetchActivities")
    let attempts = 0,
      started!: () => void,
      release!: () => void
    const ready = new Promise<void>((resolve) => {
        started = resolve
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
    server.use(
      http.get(`${base}/dashboard/capabilities`, async () => {
        attempts++
        if (attempts > 1) {
          started()
          await gate
        }
        return reply({ allowedModules: attempts > 1 ? [] : ["dashboard.activity"], revision: String(attempts) })
      }),
      http.get(`${base}/system/activities`, () => reply({ items: [activity("initial")], size: 20, nextCursor: null })),
    )
    const hook = renderHook(
      ({ category }: { category: "all" | "user" }) => {
        useHomeLive()
        return { query: useHomeActivities(category), refresh: useHomeRefresh() }
      },
      { initialProps: { category: "all" as "all" | "user" }, wrapper },
    )
    await waitFor(() => expect(hook.result.current.query.data?.items[0]?.id).toBe("initial"))
    expect(request).toHaveBeenCalledTimes(1)
    let pending: Promise<unknown> | undefined
    if (trigger === "paused category") {
      act(() => onlineManager.setOnline(false))
      hook.rerender({ category: "user" })
      await waitFor(() => expect(hook.result.current.query.fetchStatus).toBe("paused"))
      act(() => {
        onlineManager.setOnline(true)
        window.dispatchEvent(new Event("online"))
      })
      await ready
    } else {
      act(() => {
        pending = hook.result.current.refresh()
      })
      await ready
      act(() => {
        void hook.result.current.query.refetch()
      })
    }
    try {
      await act(async () => {
        await Promise.resolve()
      })
      expect(request).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
    await act(async () => {
      await pending
    })
    await waitFor(() => expect(hook.result.current.query.data).toBeUndefined())
    expect(request).toHaveBeenCalledTimes(1)
    expect(attempts).toBe(2)
  },
)

test("reconnect keeps the complete snapshot and replays overlapping live events in order", async () => {
  const { wrapper } = setup(["dashboard.infrastructure", "dashboard.activity", "dashboard.api-monitoring"])
  let activityReads = 0,
    resourceReads = 0,
    topReads = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const top = [{ path: "/old", method: "GET", requestCount: 1, errorCount: 1, errorRate: 100, avgMs: 1, p95Ms: 1 }]
  server.use(
    http.get(`${base}/system/activities`, async () => {
      activityReads++
      if (activityReads > 1) await gate
      return reply({
        items: activityReads > 1 ? [activity("missed"), activity("old")] : [activity("old")],
        size: 20,
        nextCursor: null,
      })
    }),
    http.get(`${base}/system/stats/resources`, async () => {
      resourceReads++
      if (resourceReads > 1) await gate
      return reply({
        instances: resourceReads > 1 ? [resource("a", 20), resource("c", 30)] : [resource("a", 1), resource("b", 2)],
        summary: resource("summary", 1),
      })
    }),
    http.get(`${base}/system/stats/api/top`, async () => {
      topReads++
      if (topReads > 1) await gate
      return reply(top)
    }),
    http.get(`${base}/system/stats/api/distribution`, () => reply([])),
    http.get(`${base}/system/stats/api/trend`, () => reply([])),
  )
  const hook = renderHook(
    () => {
      useHomeLive()
      return { activity: useHomeActivities("all"), resources: useHomeResources(), api: useHomeApi() }
    },
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.api.top.data).toHaveLength(1))
  await waitFor(() => expect(hook.result.current.resources.data?.instances).toHaveLength(2))
  await waitFor(() => expect(hook.result.current.activity.data?.items).toHaveLength(1))
  act(() => {
    stream.handlers.get("connect")?.(undefined)
    stream.handlers.get("connect")?.(undefined)
  })
  await waitFor(() => expect([activityReads, resourceReads, topReads]).toEqual([2, 2, 2]))
  try {
    await act(async () => {
      stream.handlers.get("dashboard:activity.created")?.(activity("live-1"))
      stream.handlers.get("dashboard:activity.created")?.(activity("live-2"))
      stream.handlers.get("dashboard:resources")?.(resource("a", 99))
      stream.handlers.get("dashboard:api_stats")?.({ topFailures: [] })
    })
    await waitFor(() =>
      expect(hook.result.current.activity.data?.items.map((item) => item.id)).toEqual(["live-2", "live-1", "old"]),
    )
    expect(hook.result.current.resources.data?.instances.find((item) => item.hostname === "a")?.cpuPercent).toBe(99)
    expect(hook.result.current.api.top.data).toEqual([])
  } finally {
    release()
  }
  await waitFor(() => expect(hook.result.current.activity.fetchStatus).toBe("idle"))
  await waitFor(() => expect(hook.result.current.resources.fetchStatus).toBe("idle"))
  await waitFor(() => expect(hook.result.current.api.top.fetchStatus).toBe("idle"))
  expect(hook.result.current.activity.data?.items.map((item) => item.id)).toEqual(["live-2", "live-1", "missed", "old"])
  expect(hook.result.current.resources.data?.instances.map((item) => [item.hostname, item.cpuPercent])).toEqual([
    ["c", 30],
    ["a", 99],
  ])
  expect(hook.result.current.api.top.data).toEqual([])
  expect([activityReads, resourceReads, topReads]).toEqual([2, 2, 2])
})
