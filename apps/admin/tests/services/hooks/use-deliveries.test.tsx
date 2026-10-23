// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useDeliveryWorkbench, deliveryKeys } from "@/services/hooks/use-deliveries"
const root = "http://localhost:16000/api/v1/admin",
  first = "10000000-0000-4000-8000-000000000001",
  second = "10000000-0000-4000-8000-000000000002"
const message = (id = first) => ({
  id,
  title: "Notice",
  content: "Body",
  category: "admin.announcement",
  contentMode: "raw",
  status: "published",
  titles: {},
  createTime: "2026-10-01T00:00:00",
})
const summary = (id = first) => ({ messageId: id, byStatus: { dead: 2, sent: 1 }, message: message(id) })
function reply(data: unknown) {
  return HttpResponse.json({ code: 0, data })
}
function setup(admin = true) {
  useAuthStore.getState().setToken("access", "delivery-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      name: "Admin",
      username: "admin",
      email: "",
      roles: [],
      buttons: admin ? [] : ["notification-delivery:read"],
      isAdmin: admin,
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  server.use(
    http.get(`${root}/notifications`, () => reply({ records: [], page: 1, pageSize: 20, total: 0 })),
    http.get(`${root}/notification-deliveries/:id/summary`, ({ params }) => reply(summary(String(params.id)))),
    http.get(`${root}/notification-deliveries`, ({ request }) => {
      const query = new URL(request.url).searchParams,
        id = query.get("messageId")
      return reply({
        records: [{ id: `row-${id}`, messageId: id, message: message(id ?? first) }],
        page: Number(query.get("page")),
        pageSize: Number(query.get("pageSize")),
        total: 40,
      })
    }),
  )
  return { client, wrapper }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("latest inbox message selection is permission gated and defaults to the first available item", async () => {
  const { wrapper } = setup()
  const queries: Record<string, string>[] = []
  server.use(
    http.get(`${root}/notifications`, ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams))
      return reply({ records: [message()], page: 1, pageSize: 20, total: 1 })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.records[0]?.id).toBe(`row-${first}`))
  expect(result.current.messageId).toBe(first)
  expect(result.current.pageSize).toBe(20)
  expect(queries).toEqual([{ page: "1", pageSize: "20", displayMode: "inbox" }])
})
test("delivery readers without announcement access can locate UUIDs without requesting recent messages", async () => {
  const { wrapper } = setup(false)
  let messageReads = 0
  server.use(
    http.get(`${root}/notifications`, () => {
      messageReads++
      return reply({ records: [] })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  expect(result.current.canReadMessages).toBe(false)
  expect(result.current.messageId).toBe("")
  act(() => {
    expect(result.current.selectMessage("invalid")).toBe(false)
    expect(result.current.selectMessage(` ${first.toUpperCase()} `)).toBe(true)
  })
  await waitFor(() => expect(result.current.records).toHaveLength(1))
  expect(messageReads).toBe(0)
  expect(result.current.canRetry).toBe(false)
})
test("switching messages clears old details, status and paging and ignores a late summary response", async () => {
  const { wrapper } = setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get(`${root}/notification-deliveries/:id/summary`, async ({ params }) => {
      if (params.id === first) await gate
      return reply(summary(String(params.id)))
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  try {
    act(() => result.current.selectMessage(first))
    await waitFor(() => expect(result.current.records).toHaveLength(1))
    act(() => {
      result.current.setStatus("dead")
      result.current.setPage(2)
    })
    act(() => result.current.selectMessage(second))
    expect(result.current.records).toEqual([])
    expect(result.current.page).toBe(1)
    expect(result.current.status).toBeNull()
    await waitFor(() => expect(result.current.summary?.messageId).toBe(second))
    release()
    await waitFor(() => expect(result.current.summaryLoading).toBe(false))
    expect(result.current.summary?.messageId).toBe(second)
  } finally {
    release()
  }
})
test("summary failures hide cached counts and disable retries until a successful refresh", async () => {
  const { wrapper } = setup()
  let fail = false
  server.use(
    http.get(`${root}/notification-deliveries/:id/summary`, () =>
      fail ? HttpResponse.json({ code: 500, message: "Unavailable", data: null }) : reply(summary()),
    ),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.canRetry).toBe(true))
  fail = true
  await act(() => result.current.refresh())
  await waitFor(() => expect(result.current.summaryFailed).toBe(true))
  expect(result.current.summary).toBeUndefined()
  expect(result.current.canRetry).toBe(false)
  fail = false
  await act(() => result.current.refresh())
  await waitFor(() => expect(result.current.canRetry).toBe(true))
})
test("retry is single-flight and cancels old snapshots before invalidating this message's summary and rows", async () => {
  const { wrapper, client } = setup()
  let calls = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.post(`${root}/notification-deliveries/:id/retry-failed`, async () => {
      calls++
      await gate
      return reply({ retried: 2 })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.canRetry).toBe(true))
  let pending!: Promise<number>
  try {
    act(() => {
      pending = result.current.retry()
    })
    await waitFor(() => expect(calls).toBe(1))
    await expect(result.current.retry()).rejects.toThrow()
    expect(calls).toBe(1)
    release()
    await act(async () => expect(await pending).toBe(2))
    await waitFor(() => expect(result.current.retrying).toBe(false))
    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
    expect(keys.some((key) => key[0] === deliveryKeys.all(0)[0] && key.includes(first))).toBe(true)
  } finally {
    release()
  }
})
test("retained retry handlers reject permission revocation and account replacement without sending requests", async () => {
  const { wrapper } = setup()
  let calls = 0
  server.use(
    http.post(`${root}/notification-deliveries/:id/retry-failed`, () => {
      calls++
      return reply({ retried: 2 })
    }),
  )
  const { result, rerender } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.canRetry).toBe(true))
  const retry = result.current.retry
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-delivery:read"] },
    }),
  )
  await expect(retry()).rejects.toThrow("permission")
  act(() => {
    useAuthStore.getState().setToken("new", "new-refresh")
    useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } })
  })
  rerender()
  await expect(retry()).rejects.toThrow("session")
  expect(calls).toBe(0)
})
test("an empty final page clamps to the new last page without leaving inaccessible old rows", async () => {
  const { wrapper } = setup()
  const pages: number[] = []
  server.use(
    http.get(`${root}/notification-deliveries`, ({ request }) => {
      const query = new URL(request.url).searchParams,
        page = Number(query.get("page"))
      pages.push(page)
      return reply({ records: page === 1 ? [{ id: "first", messageId: first }] : [], page, pageSize: 20, total: 1 })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.records[0]?.id).toBe("first"))
  act(() => result.current.setPage(2))
  await waitFor(() => expect(pages).toContain(2))
  await waitFor(() => expect(result.current.page).toBe(1))
  await waitFor(() => expect(result.current.records[0]?.id).toBe("first"))
})

test("rows from the prior page are hidden while the new page is pending", async () => {
  const { wrapper } = setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get(`${root}/notification-deliveries`, async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"))
      if (page === 2) await gate
      return reply({ records: [{ id: `page-${page}`, messageId: first }], page, pageSize: 20, total: 40 })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  try {
    await waitFor(() => expect(result.current.records[0]?.id).toBe("page-1"))
    act(() => result.current.setPage(2))
    expect(result.current.records).toEqual([])
    expect(result.current.loading).toBe(true)
    release()
    await waitFor(() => expect(result.current.records[0]?.id).toBe("page-2"))
  } finally {
    release()
  }
})
test("a retry cancels a pending old list snapshot so its later response cannot overwrite the refreshed rows", async () => {
  const { wrapper } = setup()
  let reads = 0,
    release!: () => void,
    status = "dead"
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get(`${root}/notification-deliveries`, async () => {
      const count = ++reads,
        captured = status
      if (count === 2) await gate
      return reply({ records: [{ id: captured, messageId: first, status: captured }], page: 1, pageSize: 20, total: 1 })
    }),
    http.post(`${root}/notification-deliveries/:id/retry-failed`, () => {
      status = "pending"
      return reply({ retried: 2 })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.records[0]?.id).toBe("dead"))
  let oldRefresh!: Promise<void>
  try {
    act(() => {
      oldRefresh = result.current.refresh()
    })
    await waitFor(() => expect(reads).toBe(2))
    await waitFor(() => expect(result.current.canRetry).toBe(true))
    await act(() => result.current.retry())
    await waitFor(() => expect(result.current.records[0]?.id).toBe("pending"))
    release()
    await act(() => oldRefresh)
    expect(result.current.records[0]?.id).toBe("pending")
    expect(reads).toBe(3)
  } finally {
    release()
  }
})
test("a confirmation for a previously selected message never retries the newly selected one", async () => {
  const { wrapper } = setup()
  let calls = 0
  server.use(
    http.post(`${root}/notification-deliveries/:id/retry-failed`, () => {
      calls++
      return reply({ retried: 2 })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.canRetry).toBe(true))
  act(() => result.current.selectMessage(second))
  await waitFor(() => expect(result.current.canRetry).toBe(true))
  await expect(result.current.retry(first)).rejects.toThrow("message changed")
  expect(calls).toBe(0)
})

test("locating the same UUID again refreshes the server snapshot instead of reusing current query data", async () => {
  const { wrapper } = setup()
  let name = "Old record",
    reads = 0
  server.use(
    http.get(`${root}/notification-deliveries`, () => {
      reads++
      return reply({ records: [{ id: name, messageId: first }], page: 1, pageSize: 20, total: 1 })
    }),
  )
  const { result } = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.records[0]?.id).toBe("Old record"))
  name = "Fresh record"
  act(() => result.current.selectMessage(first))
  await waitFor(() => expect(result.current.records[0]?.id).toBe("Fresh record"))
  expect(reads).toBe(2)
})
test("reopening during an old pending read starts a fresh request and unmounted retry handlers cannot write", async () => {
  const { wrapper } = setup()
  let reads = 0,
    writes = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get(`${root}/notification-deliveries`, async () => {
      const index = ++reads
      if (index === 1) await gate
      return reply({
        records: [{ id: index === 1 ? "Old snapshot" : "Fresh snapshot", messageId: first }],
        page: 1,
        pageSize: 20,
        total: 1,
      })
    }),
    http.post(`${root}/notification-deliveries/:id/retry-failed`, () => {
      writes++
      return reply({ retried: 2 })
    }),
  )
  const firstHook = renderHook(() => useDeliveryWorkbench(), { wrapper })
  act(() => firstHook.result.current.selectMessage(first))
  await waitFor(() => expect(reads).toBe(1))
  const oldRetry = firstHook.result.current.retry
  firstHook.unmount()
  const next = renderHook(() => useDeliveryWorkbench(), { wrapper })
  try {
    act(() => next.result.current.selectMessage(first))
    await waitFor(() => expect(reads).toBe(2))
    await waitFor(() => expect(next.result.current.records[0]?.id).toBe("Fresh snapshot"))
    release()
    await waitFor(() => expect(next.result.current.canRetry).toBe(true))
    expect(next.result.current.records[0]?.id).toBe("Fresh snapshot")
    await expect(oldRetry()).rejects.toThrow("unmounted")
    expect(writes).toBe(0)
  } finally {
    release()
  }
})
