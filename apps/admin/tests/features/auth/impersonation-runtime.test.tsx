// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"
import { queryClient } from "@/services/query-client"
import {
  ImpersonationBoundary,
  impersonationSession,
  useImpersonationStore,
} from "@/features/auth/impersonation-runtime"
import { beginImpersonation, getCredentials, restoreImpersonator } from "@/features/auth/impersonation-storage"
import { getAuthSession } from "@/services/auth-session"

vi.mock("@/services/app-socket", () => ({ resetAppSockets: vi.fn() }))
const base = "http://localhost:16000/api/v1"
const actor = {
  id: "actor",
  name: "Actor",
  username: "actor",
  email: "actor@example.com",
  createTime: "",
  updateTime: "",
  isAdmin: true,
  roles: [],
  buttons: [],
}
const subject = { ...actor, id: "subject", name: "Subject", username: "subject", isAdmin: false }
const created = {
  sessionId: "subject-session",
  accessToken: "subject-access",
  expiresAt: "2099-01-01T00:00:00Z",
  subject: { id: "subject", name: "Subject", username: "subject" },
}
const routes = {
  routes: [
    { name: "home", path: "/home", component: "view.home", meta: { title: "Home" } },
    { name: "manage_user", path: "/manage/user", component: "view.manage_user", meta: { title: "Users" } },
  ],
  home: "home",
}
function Identity() {
  const info = useAuthStore((s) => s.userInfo)
  return <div data-testid="private-ui">{info?.name || "unknown"}</div>
}
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, "", "/manage/user")
  useAuthStore.getState().setToken("actor-access", "actor-refresh")
  useAuthStore.getState().setUserInfo(actor)
  getAuthSession()
  queryClient.clear()
  server.use(
    http.post(`${base}/auth/impersonations`, () => HttpResponse.json({ code: 0, data: created })),
    http.get(`${base}/auth/impersonations/current`, () =>
      HttpResponse.json({ code: 0, data: { ...created, actor, createdAt: "2026-01-01T00:00:00Z" } }),
    ),
    http.delete(`${base}/auth/impersonations/current`, () => HttpResponse.json({ code: 0, data: true })),
    http.get(`${base}/auth/user/info`, ({ request }) =>
      HttpResponse.json({
        code: 0,
        data: request.headers.get("Authorization") === "Bearer subject-access" ? subject : actor,
      }),
    ),
    http.get(`${base}/route/user`, () => HttpResponse.json({ code: 0, data: routes })),
  )
})
afterEach(() => {
  impersonationSession.cancel()
  useAuthStore.getState().clearAuth()
  useImpersonationStore.setState({ snapshot: null, transitionSession: null })
  queryClient.clear()
  vi.restoreAllMocks()
  window.history.replaceState({}, "", "/")
})
test("an actual API transition hides old private UI, clears caches and routes, then restores the authorized return path", async () => {
  let release!: () => void,
    loading = false
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(`${base}/auth/user/info`, async ({ request }) => {
      if (request.headers.get("Authorization") === "Bearer subject-access") {
        loading = true
        await gate
        return HttpResponse.json({ code: 0, data: subject })
      }
      return HttpResponse.json({ code: 0, data: actor })
    }),
  )
  queryClient.setQueryData(["actor-secret"], "private")
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor")
  let entered!: Promise<boolean>
  act(() => {
    entered = impersonationSession.enter({ targetUserId: "subject" }, "/manage/user?status=1")
  })
  await waitFor(() => expect(loading).toBe(true))
  expect(screen.queryByTestId("private-ui")).not.toBeInTheDocument()
  expect(queryClient.getQueryData(["actor-secret"])).toBeUndefined()
  await act(async () => {
    release()
    expect(await entered).toBe(true)
  })
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Subject")
  expect(useImpersonationStore.getState().snapshot?.sessionId).toBe("subject-session")
  expect(useRouteStore.getState().snapshot.byName.home).toBeDefined()
  expect(window.location.pathname).toBe("/home")
  queryClient.setQueryData(["subject-secret"], "private")
  await act(async () => {
    await impersonationSession.stop()
  })
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor")
  expect(queryClient.getQueryData(["subject-secret"])).toBeUndefined()
  expect(window.location.pathname + window.location.search).toBe("/manage/user?status=1")
})
test("returning to a removed route uses the actor's authorized home", async () => {
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  await act(async () => {
    expect(await impersonationSession.enter({ targetUserId: "subject" }, "/removed/private")).toBe(true)
  })
  await act(async () => {
    await impersonationSession.stop()
  })
  expect(window.location.pathname).toBe("/home")
})
test("a forced Socket auth failure restores the actor rather than dropping both identities", async () => {
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  await act(async () => {
    await impersonationSession.enter({ targetUserId: "subject" }, "/manage/user")
  })
  act(() => useAuthStore.getState().clearAuth("forced"))
  await waitFor(() => expect(useAuthStore.getState().userInfo?.id).toBe("actor"))
  expect(getCredentials()).toEqual({ accessToken: "actor-access", refreshToken: "actor-refresh" })
  expect(useImpersonationStore.getState().snapshot).toBeNull()
})
test("initial invalid subject validation and orphan backups restore before mounting private UI", async () => {
  beginImpersonation(created, "/manage/user")
  useAuthStore.setState({ token: "subject-access", refreshToken: "", userInfo: null })
  server.use(http.get(`${base}/auth/impersonations/current`, () => HttpResponse.json({ code: 14017, data: null })))
  const view = renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  expect(screen.queryByTestId("private-ui")).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor"))
  view.unmount()
  beginImpersonation(created, "/manage/user")
  localStorage.removeItem("impersonation")
  useAuthStore.setState({ token: "subject-access", refreshToken: "", userInfo: null })
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  expect(screen.queryByTestId("private-ui")).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor"))
  expect(localStorage.getItem("impersonator")).toBeNull()
})
test("focus revalidates an active session and expiry stops it", async () => {
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  await act(async () => {
    await impersonationSession.enter({ targetUserId: "subject" }, "/manage/user")
  })
  server.use(
    http.get(`${base}/auth/impersonations/current`, () =>
      HttpResponse.json({
        code: 0,
        data: { ...created, expiresAt: "2000-01-01T00:00:00Z", actor, createdAt: "2026-01-01T00:00:00Z" },
      }),
    ),
  )
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor"))
})
test("canonical storage changes in another tab discard identity caches and publish the new snapshot", async () => {
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  queryClient.setQueryData(["actor-secret"], "private")
  act(() => {
    beginImpersonation(created, "/manage/user")
    window.dispatchEvent(new StorageEvent("storage", { key: "impersonation", storageArea: localStorage }))
  })
  await waitFor(() => expect(useImpersonationStore.getState().snapshot?.sessionId).toBe("subject-session"))
  await waitFor(() => expect(useImpersonationStore.getState().transitionSession).toBeNull())
  expect(queryClient.getQueryData(["actor-secret"])).toBeUndefined()
  expect(useAuthStore.getState().token).toBe("subject-access")
  expect(useAuthStore.getState().userInfo).toBeNull()
  act(() => {
    restoreImpersonator()
    window.dispatchEvent(new StorageEvent("storage", { key: "impersonation", storageArea: localStorage }))
  })
  await waitFor(() => expect(useAuthStore.getState().token).toBe("actor-access"))
  expect(useImpersonationStore.getState().snapshot).toBeNull()
})

test("an external stop after a local entry also discards private subject caches", async () => {
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  await act(async () => {
    await impersonationSession.enter({ targetUserId: "subject" }, "/manage/user")
  })
  queryClient.setQueryData(["subject-secret"], "private")
  act(() => {
    restoreImpersonator()
    window.dispatchEvent(new StorageEvent("storage", { key: "impersonation", storageArea: localStorage }))
  })
  await waitFor(() => expect(useAuthStore.getState().token).toBe("actor-access"))
  expect(queryClient.getQueryData(["subject-secret"])).toBeUndefined()
  expect(useAuthStore.getState().userInfo).toBeNull()
})

test("a creation request keeps the actor UI mounted until successful credential switching", async () => {
  let release!: () => void,
    requested = false
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.post(`${base}/auth/impersonations`, async () => {
      requested = true
      await gate
      return HttpResponse.json({ code: 15001, data: null })
    }),
  )
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  let pending!: Promise<boolean>
  act(() => {
    pending = impersonationSession.enter({ targetUserId: "subject" }, "/manage/user")
  })
  await waitFor(() => expect(requested).toBe(true))
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor")
  await act(async () => {
    release()
    expect(await pending).toBe(false)
  })
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor")
})

test("administrator status revoked during creation prevents a late subject token from being adopted", async () => {
  let release!: () => void,
    requested = false
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.post(`${base}/auth/impersonations`, async () => {
      requested = true
      await gate
      return HttpResponse.json({ code: 0, data: created })
    }),
  )
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  let pending!: Promise<boolean>
  act(() => {
    pending = impersonationSession.enter({ targetUserId: "subject" }, "/manage/user")
  })
  await waitFor(() => expect(requested).toBe(true))
  act(() => useAuthStore.getState().setUserInfo({ ...actor, isAdmin: false }))
  await act(async () => {
    release()
    expect(await pending).toBe(false)
  })
  expect(getCredentials()).toEqual({ accessToken: "actor-access", refreshToken: "actor-refresh" })
})

test("an old transition waiting for query cancellation cannot erase a newer login's identity, cache or menu state", async () => {
  let release!: () => void,
    clearing = false
  const gate = new Promise<void>((r) => {
    release = r
  })
  vi.spyOn(queryClient, "cancelQueries").mockImplementationOnce(() => {
    clearing = true
    return gate
  })
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  let pending!: Promise<boolean>
  act(() => {
    pending = impersonationSession.enter({ targetUserId: "subject" }, "/manage/user")
  })
  await waitFor(() => expect(clearing).toBe(true))
  act(() => {
    useAuthStore.getState().setToken("replacement-access", "replacement-refresh")
    useAuthStore.getState().setUserInfo({ ...actor, id: "replacement", name: "Replacement" })
    queryClient.setQueryData(["replacement-private"], "new identity draft")
  })
  await act(async () => {
    release()
    expect(await pending).toBe(false)
  })
  expect(useAuthStore.getState().userInfo?.id).toBe("replacement")
  expect(queryClient.getQueryData(["replacement-private"])).toBe("new identity draft")
  expect(useImpersonationStore.getState().snapshot).toBeNull()
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Replacement")
})

test("restoring the actor can return to the public builtin iframe without a backend menu grant", async () => {
  const path = `/iframe-page/${encodeURIComponent("https://example.com/actor-frame?path=%2Fkeep")}`
  window.history.replaceState({}, "", path)
  renderAdmin(
    <ImpersonationBoundary>
      <Identity />
    </ImpersonationBoundary>,
  )
  await act(async () => {
    expect(await impersonationSession.enter({ targetUserId: "subject" }, path)).toBe(true)
  })
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Subject")
  await act(async () => {
    await impersonationSession.stop()
  })
  expect(screen.getByTestId("private-ui")).toHaveTextContent("Actor")
  expect(window.location.pathname).toBe(path)
  expect(useRouteStore.getState().snapshot.byName["iframe-page"]?.kind).toBe("iframe")
})
