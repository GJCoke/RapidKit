// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import {
  useNotificationInbox,
  useNotificationActions,
  notificationKeys,
  recallNotification,
  receiveNotification,
  useNotificationUnread,
  receiveUnreadCount,
} from "@/services/hooks/use-notifications"
import type { NotificationMessage } from "@/services/api/notification"
import { getAuthSession } from "@/services/auth-session"

const base = "http://localhost:16000/api/v1/notifications"
const message: NotificationMessage = {
  id: "inbox",
  messageId: "message",
  contentMode: "raw",
  title: "Private title",
  content: "Private body",
  level: "info",
  category: "system.security",
  mandatory: false,
  status: "published",
  createTime: "2026-10-23T08:00:00Z",
  action: { type: "external", url: "https://example.com" },
}
function setup() {
  useAuthStore.getState().setToken("first", "refresh")
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper, session: getAuthSession() }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("cursor inbox deduplicates overlapping pages and keeps loaded messages on a failed next page", async () => {
  let fail = true
  server.use(
    http.get(base, ({ request }) => {
      const next = new URL(request.url).searchParams.get("cursor")
      if (next && fail) return HttpResponse.json({ code: 500, message: "Failed", data: null })
      return HttpResponse.json({
        code: 0,
        data: {
          items: next ? [message, { ...message, id: "second" }] : [message],
          nextCursor: next ? null : "next",
          size: 20,
        },
      })
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => useNotificationInbox({ archived: "active" }), { wrapper })
  await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(["inbox"]))
  await act(() => result.current.fetchNextPage())
  await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true))
  expect(result.current.items[0]?.title).toBe("Private title")
  fail = false
  await act(() => result.current.fetchNextPage())
  await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(["inbox", "second"]))
  expect(result.current.hasNextPage).toBe(false)
})
test("realtime recalls remain authoritative over a late HTTP page and remove unread messages", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, async () => {
      await gate
      return HttpResponse.json({ code: 0, data: { items: [message], size: 20 } })
    }),
  )
  const { wrapper, client, session } = setup()
  const { result } = renderHook(() => useNotificationInbox({ unreadOnly: true }), { wrapper })
  act(() => recallNotification(client, session, "message"))
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.items).toEqual([])
  const all = renderHook(() => useNotificationInbox({}), { wrapper })
  await waitFor(() => expect(all.result.current.items[0]?.status).toBe("recalled"))
  expect(all.result.current.items[0]).toMatchObject({ title: "", content: "", action: null, contentParams: null })
})
test("an old account's mutation cannot remove the new account's notification with the same ID", async () => {
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, () => HttpResponse.json({ code: 0, data: { items: [message], size: 20 } })),
    http.delete(`${base}/inbox`, async () => {
      started = true
      await gate
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => ({ inbox: useNotificationInbox({}), actions: useNotificationActions() }), {
    wrapper,
  })
  await waitFor(() => expect(result.current.inbox.items).toHaveLength(1))
  let pending!: Promise<unknown>
  act(() => {
    pending = result.current.actions.mutateAsync({ type: "delete", id: "inbox" })
  })
  await waitFor(() => expect(started).toBe(true))
  act(() => useAuthStore.getState().setToken("second", "second-refresh"))
  await waitFor(() => expect(result.current.inbox.items).toHaveLength(1))
  await act(async () => {
    release()
    await pending
  })
  expect(result.current.inbox.items[0]?.title).toBe("Private title")
})
test("new notifications merge once into matching filters and realtime counts defeat old HTTP counts", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, () => HttpResponse.json({ code: 0, data: { items: [], size: 20 } })),
    http.get(`${base}/unread-count`, async () => {
      await gate
      return HttpResponse.json({ code: 0, data: { count: 99 } })
    }),
  )
  const { wrapper, client, session } = setup()
  const { result } = renderHook(
    () => ({ inbox: useNotificationInbox({ category: "system.security" }), unread: useNotificationUnread() }),
    { wrapper },
  )
  await waitFor(() => expect(result.current.inbox.isSuccess).toBe(true))
  act(() => {
    receiveNotification(client, session, message)
    receiveNotification(client, session, message)
    receiveUnreadCount(client, session, 1)
  })
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() => expect(result.current.unread.isFetching).toBe(false))
  expect(result.current.unread.data?.count).toBe(1)
  expect(result.current.inbox.items.map((item) => item.id)).toEqual(["inbox"])
  expect(client.getQueryData(notificationKeys.recalls(session))).toBeDefined()
})

test("an in-flight old inbox refresh cannot restore a notification after successful deletion", async () => {
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, async () => {
      if (++calls > 1) await gate
      return HttpResponse.json({ code: 0, data: { items: [message], size: 20 } })
    }),
    http.delete(`${base}/inbox`, () => HttpResponse.json({ code: 0, data: {} })),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => ({ inbox: useNotificationInbox({}), actions: useNotificationActions() }), {
    wrapper,
  })
  await waitFor(() => expect(result.current.inbox.items).toHaveLength(1))
  let refresh!: Promise<unknown>
  act(() => {
    refresh = result.current.inbox.refetch()
  })
  await waitFor(() => expect(calls).toBe(2))
  await act(() => result.current.actions.mutateAsync({ type: "delete", id: "inbox" }))
  await waitFor(() => expect(result.current.inbox.items).toHaveLength(0))
  await act(async () => {
    release()
    await refresh
  })
  await waitFor(() => expect(result.current.inbox.isFetching).toBe(false))
  expect(result.current.inbox.items).toHaveLength(0)
})

test("a recall recalibrates a still-loading unread count instead of accepting its older snapshot", async () => {
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/unread-count`, async () => {
      const first = ++calls === 1
      if (first) await gate
      return HttpResponse.json({ code: 0, data: { count: first ? 99 : 0 } })
    }),
  )
  const { wrapper, client, session } = setup()
  const { result } = renderHook(() => useNotificationUnread(), { wrapper })
  await waitFor(() => expect(calls).toBe(1))
  act(() => recallNotification(client, session, "message"))
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() => expect(result.current.isFetching).toBe(false))
  expect(result.current.data?.count).toBe(0)
})

test("a notification arriving during an inbox load survives the older page response", async () => {
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, async () => {
      const first = ++calls === 1
      if (first) await gate
      return HttpResponse.json({ code: 0, data: { items: first ? [] : [message], size: 20 } })
    }),
  )
  const { wrapper, client, session } = setup()
  const { result } = renderHook(() => useNotificationInbox({}), { wrapper })
  await waitFor(() => expect(calls).toBe(1))
  act(() => receiveNotification(client, session, message))
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() => expect(result.current.isFetching).toBe(false))
  expect(result.current.items.map((item) => item.id)).toEqual(["inbox"])
})

test("a page requested during a pending mutation cannot restore a deleted notification afterward", async () => {
  let releaseDelete!: () => void,
    releaseRefresh!: () => void,
    reads = 0,
    deleting = false
  const deletion = new Promise<void>((resolve) => {
    releaseDelete = resolve
  })
  const refresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve
  })
  server.use(
    http.get(base, async () => {
      if (++reads > 1) await refresh
      return HttpResponse.json({ code: 0, data: { items: [message], size: 20 } })
    }),
    http.delete(`${base}/inbox`, async () => {
      deleting = true
      await deletion
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => ({ inbox: useNotificationInbox({}), actions: useNotificationActions() }), {
    wrapper,
  })
  await waitFor(() => expect(result.current.inbox.items).toHaveLength(1))
  let pendingDelete!: Promise<unknown>, pendingRefresh!: Promise<unknown>
  act(() => {
    pendingDelete = result.current.actions.mutateAsync({ type: "delete", id: "inbox" })
  })
  await waitFor(() => expect(deleting).toBe(true))
  act(() => {
    pendingRefresh = result.current.inbox.refetch()
  })
  await waitFor(() => expect(reads).toBe(2))
  await act(async () => {
    releaseDelete()
    await pendingDelete
  })
  await waitFor(() => expect(result.current.inbox.items).toHaveLength(0))
  await act(async () => {
    releaseRefresh()
    await pendingRefresh
  })
  await waitFor(() => expect(result.current.inbox.isFetching).toBe(false))
  expect(result.current.inbox.items).toHaveLength(0)
})

test("a new message during permission-reset count loading recalibrates the complete unread baseline", async () => {
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/unread-count`, async () => {
      const call = ++calls
      if (call === 2) await gate
      return HttpResponse.json({ code: 0, data: { count: call > 2 ? 21 : 20 } })
    }),
  )
  const { wrapper, client, session } = setup()
  const { result } = renderHook(() => useNotificationUnread(), { wrapper })
  await waitFor(() => expect(result.current.data?.count).toBe(20))
  let pending!: Promise<unknown>
  act(() => {
    pending = client.resetQueries({ queryKey: notificationKeys.root(session) })
  })
  await waitFor(() => expect(calls).toBe(2))
  act(() => receiveNotification(client, session, message))
  await act(async () => {
    release()
    await pending
  })
  await waitFor(() => expect(result.current.isFetching).toBe(false))
  expect(result.current.data?.count).toBe(21)
})

test.each(["read", "archive", "delete"] as const)(
  "a successful %s recalibrates an initially pending unread snapshot",
  async (type) => {
    let release!: () => void,
      reads = 0
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(base, () => HttpResponse.json({ code: 0, data: { items: [message], size: 20 } })),
      http.get(`${base}/unread-count`, async () => {
        const first = ++reads === 1
        if (first) await gate
        return HttpResponse.json({ code: 0, data: { count: first ? 1 : 0 } })
      }),
      http.patch(`${base}/inbox/read`, () => HttpResponse.json({ code: 0, data: {} })),
      http.patch(`${base}/inbox/archive`, () => HttpResponse.json({ code: 0, data: {} })),
      http.delete(`${base}/inbox`, () => HttpResponse.json({ code: 0, data: {} })),
    )
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({ inbox: useNotificationInbox({}), unread: useNotificationUnread(), actions: useNotificationActions() }),
      { wrapper },
    )
    try {
      await waitFor(() => expect(result.current.inbox.items).toHaveLength(1))
      await waitFor(() => expect(reads).toBe(1))
      await act(() => result.current.actions.mutateAsync({ type, id: "inbox" }))
      act(() => release())
      await waitFor(() => expect(result.current.unread.isFetching).toBe(false))
      expect(result.current.unread.data?.count).toBe(0)
    } finally {
      release()
    }
  },
)

test("closing the popover during a request cannot let its late snapshot erase a realtime message", async () => {
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const { wrapper, client, session } = setup()
  client.setQueryDefaults(notificationKeys.inboxes(session), { staleTime: 300_000 })
  const live = { ...message, id: "live", messageId: "live-message", title: "New notice" }
  server.use(
    http.get(base, async () => {
      const call = ++calls
      if (call === 2) await gate
      return HttpResponse.json({ code: 0, data: { items: call > 2 ? [live] : [], size: 20 } })
    }),
  )
  const { result, rerender } = renderHook(({ open }) => useNotificationInbox({}, open), {
    wrapper,
    initialProps: { open: true },
  })
  try {
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.refetch()
    })
    await waitFor(() => expect(calls).toBe(2))
    rerender({ open: false })
    act(() => receiveNotification(client, session, live))
    await act(async () => {
      release()
      await pending
    })
    rerender({ open: true })
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.items.map((item) => item.id)).toEqual(["live"])
  } finally {
    release()
  }
})
