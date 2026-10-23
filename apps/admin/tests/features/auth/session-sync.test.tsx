// @vitest-environment jsdom
import { EventEmitter } from "node:events"
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
