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
import { useMenuMutations } from "@/services/hooks/use-menus"
const base = "http://localhost:16000/api/v1"
const body = {
  menuName: "Test",
  routeName: "test",
  routePath: "/test",
  menuType: "1" as const,
  order: 0,
  iconType: "1" as const,
  status: "1" as const,
  hideInMenu: false,
  keepAlive: false,
  constant: false,
  multiTab: false,
  query: [],
}
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
  return { client, ...renderHook(() => useMenuMutations(), { wrapper }) }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("menu mutations invalidate menu trees, active-menu candidates, routes and role menu grouping", async () => {
  server.use(http.post(`${base}/manage/menus`, () => HttpResponse.json({ code: 0, data: body })))
  const { result, client } = setup()
  const list = ["menus", getAuthSession(), {}],
    options = ["menus", getAuthSession(), "active", "parent", false]
  client.setQueryData(list, { records: [] })
  client.setQueryData(options, [])
  const routes = ["user-routes", getAuthSession()],
    groups = ["permission-menus", getAuthSession()]
  client.setQueryData(routes, [])
  client.setQueryData(groups, [])
  await act(() => result.current.create.mutateAsync(body))
  expect(client.getQueryState(list)?.isInvalidated).toBe(true)
  expect(client.getQueryState(options)?.isInvalidated).toBe(true)
  expect(client.getQueryState(routes)?.isInvalidated).toBe(true)
  expect(client.getQueryState(groups)?.isInvalidated).toBe(true)
})
test("a queued action rechecks current permission before making a request", async () => {
  const { result } = setup()
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["menu:read"] },
    }),
  )
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("permission revoked")
})

test("a mutation retained by an old editor cannot act in another login", async () => {
  let calls = 0
  server.use(
    http.post(`${base}/manage/menus`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: body })
    }),
  )
  const { result } = setup()
  act(() => useAuthStore.getState().setToken("other-access", "other-refresh"))
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("session changed")
  expect(calls).toBe(0)
})
