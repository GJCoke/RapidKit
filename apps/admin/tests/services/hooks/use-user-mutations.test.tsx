// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, cleanup, renderHook } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { beginImpersonation } from "@/features/auth/impersonation-storage"
import {
  useCreateUser,
  useUpdateUser,
  useResendUserInvite,
  useChangeUserPassword,
} from "@/services/hooks/use-user-mutations"
const base = "http://localhost:16000/api/v1",
  body = {
    name: "Parity User",
    username: "parity_user",
    email: "parity@example.test",
    status: "1" as const,
    roles: [],
    isAdmin: false,
  }
function setup() {
  useAuthStore.getState().setToken("access", "user-mutation-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "actor",
      username: "actor",
      name: "Actor",
      email: "",
      isAdmin: true,
      roles: [],
      buttons: [],
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return {
    client,
    ...renderHook(
      () => ({
        create: useCreateUser(),
        update: useUpdateUser(),
        resend: useResendUserInvite(),
        password: useChangeUserPassword(),
      }),
      { wrapper },
    ),
  }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  localStorage.removeItem("impersonation")
})
test("user updates apply the latest restricted fields and administrator policy, then invalidate current lists, counts and audience choices", async () => {
  let payload: unknown
  server.use(
    http.put(`${base}/users/u1`, async ({ request }) => {
      payload = await request.json()
      return HttpResponse.json({ code: 0, data: { id: "u1" } })
    }),
  )
  const hook = setup(),
    session = getAuthSession()
  const keys = [
    ["users", session, "list"],
    ["users", session, "counts"],
    ["users", session, "options"],
    ["announcement-options", session],
  ]
  keys.forEach((key) => hook.client.setQueryData(key, []))
  act(() =>
    useAuthStore.setState({
      userInfo: {
        ...useAuthStore.getState().userInfo!,
        isAdmin: false,
        buttons: ["user:update"],
        restrictedFields: { user: { email: "masked", phone: "hidden", remark: "hidden" } },
      },
    }),
  )
  await act(() =>
    hook.result.current.update.mutateAsync({
      userId: "u1",
      data: { ...body, isAdmin: true, phone: "masked", remark: "hidden" },
    }),
  )
  expect(payload).toEqual({ name: "Parity User", username: "parity_user", status: "1", roles: [] })
  keys.forEach((key) => expect(hook.client.getQueryState(key)?.isInvalidated).toBe(true))
})
test("retained create actions recheck current permissions and the original editor session before any HTTP call", async () => {
  let calls = 0
  server.use(
    http.post(`${base}/users`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: body })
    }),
  )
  const hook = setup(),
    create = hook.result.current.create.mutateAsync
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: [] } }))
  await expect(create(body)).rejects.toThrow("permission revoked")
  act(() => {
    useAuthStore.getState().setToken("other", "other-user-refresh")
    useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } })
  })
  await expect(create(body)).rejects.toThrow("session changed")
  expect(calls).toBe(0)
})
test("responses arriving after an identity change cannot report success or invalidate another login", async () => {
  let release!: () => void, received!: () => void
  const started = new Promise<void>((resolve) => {
      received = resolve
    }),
    pending = new Promise<void>((resolve) => {
      release = resolve
    })
  server.use(
    http.post(`${base}/users`, async () => {
      received()
      await pending
      return HttpResponse.json({ code: 0, data: body })
    }),
  )
  const hook = setup()
  let request!: Promise<unknown>
  act(() => {
    request = hook.result.current.create.mutateAsync(body)
  })
  const failure = expect(request).rejects.toThrow("session changed")
  await started
  act(() => useAuthStore.getState().setToken("other", "other-user-refresh"))
  const next = ["users", getAuthSession(), "list"]
  hook.client.setQueryData(next, [])
  release()
  await failure
  expect(hook.client.getQueryState(next)?.isInvalidated).toBe(false)
})
test("resend requires actual create authority; password changes require self or administrator and an old password for self", async () => {
  let calls = 0
  server.use(
    http.all(`${base}/users/*`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  const hook = setup()
  act(() =>
    useAuthStore.setState({
      userInfo: {
        ...useAuthStore.getState().userInfo!,
        isAdmin: false,
        buttons: ["user:update", "user:reset-password"],
      },
    }),
  )
  await expect(hook.result.current.resend.mutateAsync("u1")).rejects.toThrow("permission revoked")
  await expect(
    hook.result.current.password.mutateAsync({ userId: "u1", data: { newPassword: "cipher" } }),
  ).rejects.toThrow("password target")
  await expect(
    hook.result.current.password.mutateAsync({ userId: "actor", data: { newPassword: "cipher" } }),
  ).rejects.toThrow("old password")
  expect(calls).toBe(0)
  await act(() =>
    hook.result.current.password.mutateAsync({
      userId: "actor",
      data: { oldPassword: "old-cipher", newPassword: "cipher" },
    }),
  )
  expect(calls).toBe(1)
  act(() => {
    beginImpersonation(
      {
        sessionId: "password-session",
        accessToken: "subject-access",
        expiresAt: "2099-01-01T00:00:00Z",
        subject: { id: "u1", name: "Subject", username: "subject" },
      },
      "/manage/user",
    )
    useAuthStore.setState((state) => ({
      token: "subject-access",
      refreshToken: "",
      userInfo: state.userInfo && { ...state.userInfo, id: "u1" },
    }))
  })
  await expect(
    hook.result.current.password.mutateAsync({
      userId: "u1",
      data: { oldPassword: "old-cipher", newPassword: "cipher" },
    }),
  ).rejects.toThrow("session changed")
  const simulated = renderHook(() => useChangeUserPassword(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={hook.client}>{children}</QueryClientProvider>
    ),
  })
  await expect(
    simulated.result.current.mutateAsync({ userId: "u1", data: { oldPassword: "old-cipher", newPassword: "cipher" } }),
  ).rejects.toThrow("password target")
  expect(calls).toBe(1)
})

test("creation drops newly restricted optional fields and rejects a required-field restriction before making a request", async () => {
  const payloads: unknown[] = []
  server.use(
    http.post(`${base}/users`, async ({ request }) => {
      payloads.push(await request.json())
      return HttpResponse.json({ code: 0, data: body })
    }),
  )
  const hook = setup()
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, restrictedFields: { user: { remark: "hidden" } } },
    }),
  )
  await act(() => hook.result.current.create.mutateAsync({ ...body, remark: "secret" }))
  expect(payloads[0]).not.toHaveProperty("remark")
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, restrictedFields: { user: { email: "masked" } } },
    }),
  )
  await expect(hook.result.current.create.mutateAsync(body)).rejects.toThrow("Required user fields restricted")
  expect(payloads).toHaveLength(1)
})
