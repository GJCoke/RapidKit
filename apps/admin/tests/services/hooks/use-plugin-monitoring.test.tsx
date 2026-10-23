// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import * as api from "@/services/api/plugin-monitoring"
import { usePluginMonitoring } from "@/services/hooks/use-plugin-monitoring"
const base = "http://localhost:16000/api/v1/system"
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function setup() {
  useAuthStore.getState().setToken("access", "plugin-monitoring-session")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: false,
      roles: [],
      buttons: ["plugin:read"],
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const requests: string[] = []
  server.use(
    http.get(`${base}/*`, ({ request }) => {
      const path = new URL(request.url).pathname
      requests.push(path)
      return reply(
        path.endsWith("/dependencies")
          ? { nodes: [], edges: [] }
          : path.endsWith("/events")
            ? { handlerErrors: {}, deadLetters: [], deadLetterCount: 0 }
            : [{ name: "System", status: "loaded" }],
      )
    }),
  )
  return { wrapper, requests }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
})
test("three resources load independently; partial failure and retry preserve other resources", async () => {
  const { wrapper, requests } = setup()
  server.use(http.get(`${base}/events`, () => HttpResponse.json({ code: 5010, msg: "event unavailable" })))
  const hook = renderHook(() => usePluginMonitoring(), { wrapper })
  await waitFor(() => expect(hook.result.current.queries.events.isError).toBe(true))
  expect(hook.result.current.plugins?.[0].name).toBe("System")
  expect(hook.result.current.graph).toEqual({ nodes: [], edges: [] })
  expect(hook.result.current.events).toBeUndefined()
  const before = requests.length
  server.use(
    http.get(`${base}/events`, () => reply({ handlerErrors: { event: 3 }, deadLetters: [], deadLetterCount: 0 })),
  )
  await act(async () => {
    await hook.result.current.queries.events.refetch()
  })
  await waitFor(() => expect(hook.result.current.events?.handlerErrors.event).toBe(3))
  expect(requests).toHaveLength(before)
  await act(async () => {
    await hook.result.current.refresh()
  })
  expect(requests).toHaveLength(before + 2)
})
test("permission loss masks loaded data and guards manual refetch; old session cannot read next account", async () => {
  const { wrapper, requests } = setup()
  const hook = renderHook(() => usePluginMonitoring(), { wrapper })
  await waitFor(() => expect(hook.result.current.plugins).toHaveLength(1))
  const before = requests.length
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(hook.result.current.plugins).toBeUndefined()
  await act(async () => {
    await hook.result.current.queries.plugins.refetch()
    await hook.result.current.refresh()
  })
  expect(requests).toHaveLength(before)
  act(() => useAuthStore.getState().setToken("other", "another-session"))
  expect(hook.result.current.graph).toBeUndefined()
})
test("unmounted pending request is aborted and never becomes another session's data", async () => {
  const { wrapper } = setup()
  const load = vi.spyOn(api, "fetchPluginList")
  let started = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/plugins`, async ({ request }) => {
      started = true
      await gate
      return reply([{ name: "Old", status: "loaded" }])
    }),
  )
  const hook = renderHook(() => usePluginMonitoring(), { wrapper })
  await waitFor(() => expect(started).toBe(true))
  hook.unmount()
  expect(load.mock.calls[0][0]?.aborted).toBe(true)
  load.mockRestore()
  act(() => useAuthStore.getState().setToken("next", "next-session"))
  await act(async () => release())
})
