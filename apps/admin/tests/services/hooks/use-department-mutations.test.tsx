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
import { useDepartmentMutations } from "@/services/hooks/use-department-mutations"
const base = "http://localhost:16000/api/v1",
  body = { name: "Department", code: "department", sort: 0, status: "1" as const }
function setup() {
  useAuthStore.getState().setToken("access", "department-write-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
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
  return { client, ...renderHook(() => useDepartmentMutations(), { wrapper }) }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
})
test("department writes retain their response and invalidate trees, counts, users and notification audience choices", async () => {
  const deleted = { id: "d1", ...body }
  server.use(http.delete(`${base}/departments/d1`, () => HttpResponse.json({ code: 0, data: deleted })))
  const hook = setup(),
    session = getAuthSession(),
    keys = [
      ["users", session, "list"],
      ["users", session, "counts"],
      ["users", session, "options", "departments"],
      ["announcement-options", session],
    ]
  keys.forEach((key) => hook.client.setQueryData(key, []))
  let value: unknown
  await act(async () => {
    value = await hook.result.current.deletion.mutateAsync("d1")
  })
  expect(value).toEqual(deleted)
  keys.forEach((key) => expect(hook.client.getQueryState(key)?.isInvalidated).toBe(true))
})
test("revoked department authority and replaced sessions cannot execute retained actions", async () => {
  let calls = 0
  server.use(
    http.all(`${base}/departments*`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: body })
    }),
  )
  const hook = setup(),
    create = hook.result.current.create.mutateAsync,
    deletion = hook.result.current.deletion.mutateAsync
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["department:read"] },
    }),
  )
  await expect(create(body)).rejects.toThrow("permission revoked")
  await expect(deletion("d1")).rejects.toThrow("permission revoked")
  act(() => useAuthStore.getState().setToken("other", "other-department-session"))
  await expect(create(body)).rejects.toThrow("session changed")
  expect(calls).toBe(0)
})
test("a failed department write leaves cached data valid and a deliberate retry resubmits the unchanged payload", async () => {
  const payloads: unknown[] = []
  server.use(
    http.put(`${base}/departments/d1`, async ({ request }) => {
      payloads.push(await request.json())
      return HttpResponse.json(
        payloads.length === 1
          ? { code: 40001, message: "duplicate department", data: null }
          : { code: 0, data: { id: "d1", ...body } },
      )
    }),
  )
  const hook = setup(),
    key = ["users", getAuthSession(), "options", "departments"]
  hook.client.setQueryData(key, [])
  await expect(hook.result.current.update.mutateAsync({ id: "d1", data: body })).rejects.toBeDefined()
  expect(hook.client.getQueryState(key)?.isInvalidated).toBe(false)
  await act(() => hook.result.current.update.mutateAsync({ id: "d1", data: body }))
  expect(payloads).toEqual([body, body])
  expect(hook.client.getQueryState(key)?.isInvalidated).toBe(true)
})
