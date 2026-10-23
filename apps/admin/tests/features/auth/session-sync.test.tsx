// @vitest-environment jsdom
import { EventEmitter } from "node:events"
import { useState } from "react"
import { useLocation } from "react-router"
import userEvent from "@testing-library/user-event"
import { renderAdmin } from "@test/setup/render"
import { useNotificationOperations } from "@/features/notifications/use-notification-operations"
import { useNotificationInbox, recallNotification, notificationKeys } from "@/services/hooks/use-notifications"
import { useRouteStore } from "@/stores/route"
import { normalizeRoutes } from "@/features/router/route-model"
import type { NotificationMessage } from "@/services/api/notification"
import { act, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test, vi } from "vitest"
import type { AuthUserInfo } from "@/services/api/auth"

const network = vi.hoisted(() => ({ socket: null as EventEmitter | null }))
vi.mock("@/services/app-socket", async () => {
  const { EventEmitter } = await import("node:events")
  return {
    openAppSocket: () => {
      network.socket = Object.assign(new EventEmitter(), { io: new EventEmitter() })
      return network.socket
    },
    closeAppSocket: () => {
      network.socket?.removeAllListeners()
    },
    resetAppSockets: () => {
      network.socket?.removeAllListeners()
    },
  }
})
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
const base = "http://localhost:16000/api/v1"
import { useAuthStore } from "@/stores/auth"
import { SessionSync } from "@/features/auth/session-sync"
import { getAuthSession } from "@/services/auth-session"
import { useUserInfo } from "@/services/hooks/use-auth"
import { useUserRoutes } from "@/services/hooks/use-routes"
import "@/locales"
function AuthQueryObservers() {
  useUserInfo()
  useUserRoutes()
  return null
}

const user: AuthUserInfo = {
  id: "reader",
  createTime: "",
  updateTime: "",
  name: "Reader",
  username: "reader",
  email: "reader@example.com",
  isAdmin: false,
  roles: ["READER"],
  buttons: ["role:read"],
  restrictedFields: {},
}
afterEach(() => {
  useAuthStore.getState().clearAuth()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test("a permission event refreshes identity and routes and clears stale private query data", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["private-data"], { email: "old@example.com" })
  useAuthStore.getState().setToken("access", "refresh")
  useAuthStore.getState().setUserInfo(user)
  server.use(
    http.get(`${base}/auth/user/info`, () =>
      HttpResponse.json({ code: 0, message: "OK", data: { ...user, name: "Updated", buttons: [] } }),
    ),
    http.get(`${base}/route/user`, () =>
      HttpResponse.json({
        code: 0,
        message: "OK",
        data: {
          routes: [{ name: "home", path: "/home", component: "view.home", meta: { title: "Home" } }],
          home: "home",
        },
      }),
    ),
  )
  render(
    <QueryClientProvider client={client}>
      <SessionSync />
    </QueryClientProvider>,
  )
  act(() => {
    network.socket?.emit("permission:changed", { scope: "user", revision: 1 })
  })
  await waitFor(() => expect(useAuthStore.getState().userInfo?.name).toBe("Updated"))
  expect(client.getQueryData(["private-data"])).toBeUndefined()
  expect(client.getQueryData(["user-routes", getAuthSession()])).toMatchObject({ data: { home: "home" } })
})

test("late permission snapshots cannot overwrite another login", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0)
  const client = new QueryClient()
  useAuthStore.getState().setToken("old-access", "old-refresh")
  useAuthStore.getState().setUserInfo(user)
  let finish = () => {}
  let requested = false
  server.use(
    http.get(`${base}/auth/user/info`, async () => {
      requested = true
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return HttpResponse.json({ code: 0, message: "OK", data: { ...user, name: "Old account" } })
    }),
    http.get(`${base}/route/user`, () =>
      HttpResponse.json({ code: 0, message: "OK", data: { routes: [], home: "home" } }),
    ),
  )
  render(
    <QueryClientProvider client={client}>
      <SessionSync />
    </QueryClientProvider>,
  )
  act(() => {
    network.socket?.emit("permission:changed", { scope: "user", revision: 1 })
  })
  await waitFor(() => expect(requested).toBe(true))
  act(() => {
    useAuthStore.getState().setToken("new-access", "new-refresh")
    useAuthStore.getState().setUserInfo({ ...user, name: "New account" })
  })
  await act(async () => {
    finish()
    await Promise.resolve()
  })
  expect(useAuthStore.getState().userInfo?.name).toBe("New account")
})

function tokenFor(subject: string, revision: number) {
  return `header.${btoa(JSON.stringify({ sub: subject, jti: revision }))}.signature`
}

test("same-account token rotation from another tab preserves the active identity and caches", async () => {
  const client = new QueryClient()
  useAuthStore.getState().setToken(tokenFor("reader", 1), tokenFor("reader", 1))
  useAuthStore.getState().setUserInfo(user)
  client.setQueryData(["editing"], "unsaved form")
  render(
    <QueryClientProvider client={client}>
      <SessionSync />
    </QueryClientProvider>,
  )
  const access = tokenFor("reader", 2)
  localStorage.setItem("accessToken", access)
  localStorage.setItem("refreshToken", access)
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: "refreshToken", storageArea: localStorage }))
  })
  await waitFor(() => expect(useAuthStore.getState().token).toBe(access))
  expect(useAuthStore.getState().userInfo?.name).toBe("Reader")
  expect(client.getQueryData(["editing"])).toBe("unsaved form")
})

test("an anonymous tab accepts another tab's login without removing its credentials", async () => {
  const client = new QueryClient()
  useAuthStore.getState().clearAuth()
  render(
    <QueryClientProvider client={client}>
      <SessionSync />
    </QueryClientProvider>,
  )
  const access = tokenFor("reader", 1)
  localStorage.setItem("accessToken", access)
  localStorage.setItem("refreshToken", access)
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: "refreshToken", storageArea: localStorage }))
  })
  await waitFor(() => expect(useAuthStore.getState().token).toBe(access))
  expect(localStorage.getItem("accessToken")).toBe(access)
})

test("older requests in the same login cannot restore a revoked permission snapshot", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().setToken("same-access", "same-refresh")
  useAuthStore.getState().setUserInfo(user)
  let infoCalls = 0
  let routeCalls = 0
  let oldCompleted = 0
  let releaseInfo = () => {}
  let releaseRoutes = () => {}
  server.use(
    http.get(`${base}/auth/user/info`, async () => {
      const old = ++infoCalls === 1
      if (old) {
        await new Promise<void>((resolve) => {
          releaseInfo = resolve
        })
        oldCompleted++
      }
      return HttpResponse.json({
        code: 0,
        message: "OK",
        data: { ...user, name: old ? "Old grant" : "New grant", buttons: old ? ["role:update"] : [] },
      })
    }),
    http.get(`${base}/route/user`, async () => {
      const old = ++routeCalls === 1
      if (old) {
        await new Promise<void>((resolve) => {
          releaseRoutes = resolve
        })
        oldCompleted++
      }
      return HttpResponse.json({
        code: 0,
        message: "OK",
        data: {
          home: "home",
          routes: [
            {
              name: old ? "secret" : "home",
              path: old ? "/secret" : "/home",
              component: "view.home",
              meta: { title: "Page" },
            },
          ],
        },
      })
    }),
  )
  render(
    <QueryClientProvider client={client}>
      <SessionSync />
      <AuthQueryObservers />
    </QueryClientProvider>,
  )
  await waitFor(() => {
    expect(infoCalls).toBe(1)
    expect(routeCalls).toBe(1)
  })
  act(() => {
    network.socket?.emit("permission:changed", { scope: "user", revision: 99 })
  })
  await waitFor(() => expect(useAuthStore.getState().userInfo?.name).toBe("New grant"))
  releaseInfo()
  releaseRoutes()
  await waitFor(() => expect(oldCompleted).toBe(2))
  await new Promise((resolve) => setTimeout(resolve, 25))
  expect(useAuthStore.getState().userInfo?.name).toBe("New grant")
  expect(useAuthStore.getState().userInfo?.buttons).toEqual([])
  expect(client.getQueryData(["user-routes", getAuthSession()])).toMatchObject({ data: { routes: [{ name: "home" }] } })
})

test("the first socket connection catches permission changes missed during the login handshake", async () => {
  const client = new QueryClient()
  useAuthStore.getState().setToken("access", "refresh")
  useAuthStore.getState().setUserInfo(user)
  server.use(
    http.get(`${base}/auth/user/info`, () =>
      HttpResponse.json({ code: 0, message: "OK", data: { ...user, name: "Fresh handshake", buttons: [] } }),
    ),
    http.get(`${base}/route/user`, () =>
      HttpResponse.json({ code: 0, message: "OK", data: { routes: [], home: "home" } }),
    ),
  )
  render(
    <QueryClientProvider client={client}>
      <SessionSync />
    </QueryClientProvider>,
  )
  act(() => {
    network.socket?.emit("connect")
  })
  await waitFor(() => expect(useAuthStore.getState().userInfo?.name).toBe("Fresh handshake"))
})

test("a first-connect permission snapshot on the public login page does not block sign-in", async () => {
  window.history.replaceState({}, "", "/login")
  const client = new QueryClient()
  useAuthStore.getState().setToken("access", "refresh")
  useAuthStore.getState().setUserInfo(user)
  server.use(
    http.get(`${base}/auth/user/info`, () =>
      HttpResponse.json({ code: 0, message: "OK", data: { ...user, name: "Public login" } }),
    ),
    http.get(`${base}/route/user`, () =>
      HttpResponse.json({ code: 0, message: "OK", data: { routes: [], home: "home" } }),
    ),
  )
  try {
    render(
      <QueryClientProvider client={client}>
        <SessionSync />
      </QueryClientProvider>,
    )
    act(() => {
      network.socket?.emit("connect")
    })
    await waitFor(() => expect(useAuthStore.getState().userInfo?.name).toBe("Public login"))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  } finally {
    window.history.replaceState({}, "", "/")
  }
})

test.each(["/notification/center", "/notification/preferences"])(
  "an authenticated personal page %s without a backend menu entry stays open after permission synchronization",
  async (path) => {
    window.history.replaceState({}, "", path)
    const client = new QueryClient()
    useAuthStore.getState().setToken("access", "refresh")
    useAuthStore.getState().setUserInfo(user)
    server.use(
      http.get(`${base}/auth/user/info`, () =>
        HttpResponse.json({ code: 0, data: { ...user, name: "Inbox refreshed" } }),
      ),
      http.get(`${base}/route/user`, () => HttpResponse.json({ code: 0, data: { routes: [], home: "home" } })),
    )
    try {
      render(
        <QueryClientProvider client={client}>
          <SessionSync />
        </QueryClientProvider>,
      )
      act(() => {
        network.socket?.emit("connect")
      })
      await waitFor(() => expect(useAuthStore.getState().userInfo?.name).toBe("Inbox refreshed"))
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    } finally {
      window.history.replaceState({}, "", "/")
    }
  },
)

const recalledMessage: NotificationMessage = {
  id: "inbox",
  messageId: "message",
  title: "Private notice",
  content: "Private body",
  contentMode: "raw",
  level: "info",
  category: "system.security",
  mandatory: false,
  status: "published",
  createTime: "2026-10-23T08:00:00Z",
  action: { route: "manage_user" },
}
function PendingNotificationRead() {
  const inbox = useNotificationInbox({})
  const operations = useNotificationOperations()
  const location = useLocation()
  const [settled, setSettled] = useState(false)
  return (
    <>
      <button
        onClick={async () => {
          await operations.read(recalledMessage, true)
          setSettled(true)
        }}
      >
        Open notice
      </button>
      <output aria-label="Read result">{settled ? "done" : "pending"}</output>
      <output aria-label="Current path">{location.pathname}</output>
      <output aria-label="Notice title">{inbox.items[0]?.title}</output>
    </>
  )
}
test("permission synchronization retains recalls while a pending read and fresh inbox overlap", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0)
  useAuthStore.getState().setToken("access", "recall-permission-refresh")
  useAuthStore.getState().setUserInfo(user)
  useRouteStore
    .getState()
    .replaceSnapshot(normalizeRoutes([{ name: "manage_user", path: "/manage/user", component: "view.manage_user" }]))
  let releaseRead!: () => void,
    releaseList!: () => void,
    reads = 0,
    reading = false
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  const listGate = new Promise<void>((resolve) => {
    releaseList = resolve
  })
  server.use(
    http.get(`${base}/notifications`, async () => {
      if (++reads > 1) await listGate
      return HttpResponse.json({ code: 0, data: { items: [recalledMessage], size: 20 } })
    }),
    http.patch(`${base}/notifications/inbox/read`, async () => {
      reading = true
      await readGate
      return HttpResponse.json({ code: 0, data: {} })
    }),
    http.get(`${base}/auth/user/info`, () =>
      HttpResponse.json({ code: 0, data: { ...user, name: "Permissions refreshed" } }),
    ),
    http.get(`${base}/route/user`, () => HttpResponse.json({ code: 0, data: { routes: [], home: "home" } })),
  )
  const { queryClient } = renderAdmin(
    <>
      <SessionSync />
      <PendingNotificationRead />
    </>,
  )
  try {
    await waitFor(() => expect(screen.getByLabelText("Notice title")).toHaveTextContent("Private notice"))
    await userEvent.setup().click(screen.getByRole("button", { name: "Open notice" }))
    await waitFor(() => expect(reading).toBe(true))
    act(() => recallNotification(queryClient, getAuthSession(), "message"))
    act(() => network.socket?.emit("permission:changed", { scope: "user", revision: 7 }))
    await waitFor(() => expect(useAuthStore.getState().userInfo?.name).toBe("Permissions refreshed"))
    await waitFor(() => expect(reads).toBeGreaterThan(1))
    act(() => releaseRead())
    await waitFor(() => expect(screen.getByLabelText("Read result")).toHaveTextContent("done"))
    expect(screen.getByLabelText("Current path")).toHaveTextContent(/^\/$/)
    act(() => releaseList())
    await waitFor(() =>
      expect(queryClient.isFetching({ queryKey: notificationKeys.inboxes(getAuthSession()) })).toBe(0),
    )
    expect(screen.getByLabelText("Notice title")).not.toHaveTextContent("Private notice")
  } finally {
    releaseRead()
    releaseList()
  }
})
