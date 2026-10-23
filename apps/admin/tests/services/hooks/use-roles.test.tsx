// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useRoleMutations } from "@/services/hooks/use-roles"
const base = "http://localhost:16000/api/v1"
const body = { name: "Reader", code: "reader", description: "", status: "1" as const, permissionCodes: [] }
function setup() {
  useAuthStore.getState().setToken("access", "refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: true,
      roles: [],
      buttons: [],
    },
  })
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useRoleMutations(), { wrapper }) }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("role mutations invalidate role lists and user role choices", async () => {
  server.use(http.post(`${base}/roles`, () => HttpResponse.json({ code: 0, data: body })))
  const { result, client } = setup()
  const list = ["roles", getAuthSession(), {}],
    options = ["users", "access", "options", "roles"]
  client.setQueryData(list, { records: [] })
  client.setQueryData(options, [])
  await act(() => result.current.create.mutateAsync(body))
  expect(client.getQueryState(list)?.isInvalidated).toBe(true)
  expect(client.getQueryState(options)?.isInvalidated).toBe(true)
})
test("a queued action rechecks current permission before making a request", async () => {
  const { result } = setup()
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["role:read"] },
    }),
  )
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("permission revoked")
})

test("a mutation retained by an old editor cannot act in another login", async () => {
  let calls = 0
  server.use(
    http.post(`${base}/roles`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: body })
    }),
  )
  const { result } = setup()
  act(() => useAuthStore.getState().setToken("other-access", "other-refresh"))
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("session changed")
  expect(calls).toBe(0)
})
