// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { announcementKeys } from "@/services/hooks/use-announcements"
import {
  useNotificationTemplates,
  useNotificationTemplateWrites,
  notificationTemplateKeys,
} from "@/services/hooks/use-notification-templates"
const base = "http://localhost:16000/api/v1/admin/notification-templates"
const body = {
  level: "info" as const,
  mandatory: false,
  enabled: true,
  code: "welcome",
  name: "Welcome",
  category: "user.invited",
  contentMode: "raw" as const,
  titleTemplate: "Title",
  contentTemplate: "Body",
}
function setup() {
  useAuthStore.getState().setToken("access", "templates-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      roles: [],
      buttons: [],
      isAdmin: true,
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient(),
    session = getAuthSession()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper, session }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("template filters preserve disabled false and begin with the source page size", async () => {
  let params: Record<string, string> = {}
  server.use(
    http.get(base, ({ request }) => {
      params = Object.fromEntries(new URL(request.url).searchParams)
      return HttpResponse.json({
        code: 0,
        data: { records: [{ id: "row", name: "Template" }], page: 1, pageSize: 20, total: 1 },
      })
    }),
  )
  const { wrapper } = setup(),
    { result } = renderHook(() => useNotificationTemplates({ keyword: "welcome", enabled: false }), { wrapper })
  await waitFor(() => expect(result.current.tableData.records[0]?.id).toBe("row"))
  expect(params).toEqual({ keyword: "welcome", enabled: "false", page: "1", pageSize: "20" })
})
test("changing template pages hides old selectable rows while the next request is pending", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"))
      if (page === 2) await gate
      return HttpResponse.json({ code: 0, data: { records: [{ id: `page-${page}` }], page, pageSize: 20, total: 40 } })
    }),
  )
  const { wrapper } = setup(),
    { result } = renderHook(() => useNotificationTemplates({}), { wrapper })
  try {
    await waitFor(() => expect(result.current.tableData.records[0]?.id).toBe("page-1"))
    act(() => result.current.setPage(2))
    await waitFor(() => expect(result.current.query.isFetching).toBe(true))
    expect(result.current.tableData.records).toEqual([])
    act(() => release())
    await waitFor(() => expect(result.current.tableData.records[0]?.id).toBe("page-2"))
  } finally {
    release()
  }
})
test("successful template writes invalidate the list and the announcement editor lookup together", async () => {
  server.use(http.post(base, () => HttpResponse.json({ code: 0, data: { id: "created" } })))
  const { client, wrapper, session } = setup(),
    list = [...notificationTemplateKeys.all(session), "list", "en-US", {}],
    lookup = [...announcementKeys.templates(session), "en-US", { keyword: "welcome", enabled: true }]
  client.setQueryData(list, { records: [] })
  client.setQueryData(lookup, { records: [{ code: "old" }] })
  const { result } = renderHook(() => useNotificationTemplateWrites(), { wrapper })
  await act(() => result.current.create.mutateAsync(body))
  expect(client.getQueryState(list)?.isInvalidated).toBe(true)
  expect(client.getQueryState(lookup)?.isInvalidated).toBe(true)
})
test("retained template writes reject revoked permissions and account replacement even after a render", async () => {
  let calls = 0
  server.use(
    http.post(base, () => {
      calls++
      return HttpResponse.json({ code: 0, data: { id: "created" } })
    }),
  )
  const { wrapper } = setup(),
    { result, rerender } = renderHook(() => useNotificationTemplateWrites(), { wrapper })
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-template:read"] },
    }),
  )
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("permission revoked")
  act(() => {
    useAuthStore.getState().setToken("other", "other-refresh")
    useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } })
  })
  rerender()
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("session changed")
  expect(calls).toBe(0)
})
test("reopening the template table refreshes its snapshot despite the application's five-minute cache", async () => {
  let name = "Old template"
  server.use(
    http.get(base, () =>
      HttpResponse.json({ code: 0, data: { records: [{ id: "template", name }], page: 1, pageSize: 20, total: 1 } }),
    ),
  )
  const { wrapper, client } = setup()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 300_000 } })
  const first = renderHook(() => useNotificationTemplates({}), { wrapper })
  await waitFor(() => expect(first.result.current.tableData.records[0]?.name).toBe("Old template"))
  first.unmount()
  name = "Fresh template"
  const second = renderHook(() => useNotificationTemplates({}), { wrapper })
  await waitFor(() => expect(second.result.current.query.isFetching).toBe(false))
  expect(second.result.current.tableData.records[0]?.name).toBe("Fresh template")
})
