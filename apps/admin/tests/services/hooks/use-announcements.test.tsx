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
import { notificationKeys } from "@/services/hooks/use-notifications"
import { invalidateNotificationBanner } from "@/services/hooks/use-notification-banner"
import {
  emptyAnnouncementForm,
  buildAnnouncementPayload,
} from "@/views/notification/manage/announcements/modules/announcement-model"
import {
  useAnnouncements,
  useAnnouncementWrites,
  useAnnouncementDetail,
  useAnnouncementTemplates,
  useAnnouncementActionTargets,
  useAnnouncementBannerSummary,
  useAnnouncementDirectories,
  announcementKeys,
} from "@/services/hooks/use-announcements"
const base = "http://localhost:16000/api/v1/admin/notifications"
function setup() {
  useAuthStore.getState().setToken("access", "announcements-refresh")
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
  return { client, wrapper, session: getAuthSession() }
}
afterEach(() => useAuthStore.getState().clearAuth())
const body = buildAnnouncementPayload({ ...emptyAnnouncementForm(), rawTitle: "Title", rawContent: "Body" }, "draft")
test("announcement pagination never exposes placeholder rows from the preceding page", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"))
      if (page === 2) await gate
      return HttpResponse.json({
        code: 0,
        data: { records: [{ id: `page-${page}`, title: `Page ${page}` }], page, pageSize: 10, total: 20 },
      })
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => useAnnouncements({}), { wrapper })
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
test("writes invalidate all announcement views and the current notification snapshots", async () => {
  server.use(http.post(base, () => HttpResponse.json({ code: 0, data: { messageId: "created" } })))
  const { wrapper, client, session } = setup()
  const list = [...announcementKeys.all(session), "list", {}],
    inbox = [...notificationKeys.inboxes(session), "zh-CN", {}]
  client.setQueryData(list, { records: [] })
  client.setQueryData(inbox, { pages: [] })
  const { result } = renderHook(() => useAnnouncementWrites(), { wrapper })
  await act(() => result.current.create.mutateAsync(body))
  expect(client.getQueryState(list)?.isInvalidated).toBe(true)
  expect(client.getQueryState(inbox)?.isInvalidated).toBe(true)
})
test("an open editor's write rechecks revoked permission without sending an API request", async () => {
  let calls = 0
  server.use(
    http.post(base, () => {
      calls++
      return HttpResponse.json({ code: 0, data: { messageId: "created" } })
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => useAnnouncementWrites(), { wrapper })
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification:read"] },
    }),
  )
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("permission revoked")
  expect(calls).toBe(0)
})
test("a retired editor cannot write after account replacement", async () => {
  let calls = 0
  server.use(
    http.post(base, () => {
      calls++
      return HttpResponse.json({ code: 0, data: { messageId: "created" } })
    }),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => useAnnouncementWrites(), { wrapper })
  act(() => useAuthStore.getState().setToken("other", "other-refresh"))
  await expect(result.current.create.mutateAsync(body)).rejects.toThrow("session changed")
  expect(calls).toBe(0)
})
test("banner summary follows notification revision events without a manual page refresh", async () => {
  let calls = 0
  server.use(
    http.post(`${base}/banner-check`, () =>
      HttpResponse.json({
        code: 0,
        data: { revision: ++calls, serverNow: "2026-10-23T08:00:00Z", current: null, scheduled: null },
      }),
    ),
  )
  const { wrapper, client, session } = setup()
  const { result } = renderHook(() => useAnnouncementBannerSummary(), { wrapper })
  await waitFor(() => expect(result.current.data?.revision).toBe(1))
  act(() => invalidateNotificationBanner(client, session, 2))
  await waitFor(() => expect(result.current.data?.revision).toBe(2))
})

test("recipient directories only fetch the types currently needed by the editor", async () => {
  const requested: string[] = []
  server.use(
    ...["roles/all", "users/all", "departments/tree"].map((path) =>
      http.get(`http://localhost:16000/api/v1/${path}`, () => {
        requested.push(path)
        return HttpResponse.json({ code: 0, data: [] })
      }),
    ),
  )
  const { wrapper } = setup()
  const { result } = renderHook(() => useAnnouncementDirectories(["user"]), { wrapper })
  await waitFor(() => expect(result.current.users.isSuccess).toBe(true))
  expect(requested).toEqual(["users/all"])
})

test("reopening announcement details refreshes the server snapshot despite the application's five-minute cache", async () => {
  let title = "Old title"
  server.use(http.get(`${base}/draft`, () => HttpResponse.json({ code: 0, data: { id: "draft", title } })))
  const { wrapper, client, session } = setup()
  client.setQueryDefaults(announcementKeys.all(session), { staleTime: 300_000 })
  const first = renderHook(() => useAnnouncementDetail("draft"), { wrapper })
  await waitFor(() => expect(first.result.current.data?.title).toBe("Old title"))
  first.unmount()
  title = "Fresh title"
  const second = renderHook(() => useAnnouncementDetail("draft"), { wrapper })
  await waitFor(() => expect(second.result.current.isFetching).toBe(false))
  expect(second.result.current.data?.title).toBe("Fresh title")
})

test("reopening template and action directories refreshes changed labels and availability", async () => {
  let label = "Old"
  server.use(
    http.get("http://localhost:16000/api/v1/admin/notification-templates", () =>
      HttpResponse.json({
        code: 0,
        data: { records: [{ code: "template", name: label }], page: 1, pageSize: 100, total: 1 },
      }),
    ),
    http.get(`${base}/action-targets`, () => HttpResponse.json({ code: 0, data: [{ menuId: "menu", label }] })),
  )
  const { wrapper, client, session } = setup()
  client.setQueryDefaults(announcementKeys.templates(session), { staleTime: 300_000 })
  client.setQueryDefaults(announcementKeys.options(session), { staleTime: 300_000 })
  const observe = () => ({ templates: useAnnouncementTemplates("", true), targets: useAnnouncementActionTargets(true) })
  const first = renderHook(observe, { wrapper })
  await waitFor(() => expect(first.result.current.templates.data?.records[0]?.name).toBe("Old"))
  await waitFor(() => expect(first.result.current.targets.data?.[0]?.label).toBe("Old"))
  first.unmount()
  label = "Fresh"
  const second = renderHook(observe, { wrapper })
  await waitFor(() =>
    expect(second.result.current.templates.isFetching || second.result.current.targets.isFetching).toBe(false),
  )
  expect(second.result.current.templates.data?.records[0]?.name).toBe("Fresh")
  expect(second.result.current.targets.data?.[0]?.label).toBe("Fresh")
})

test("recipient directory choices refresh when a new editor opens", async () => {
  let name = "Old reader"
  server.use(
    http.get("http://localhost:16000/api/v1/users/all", () =>
      HttpResponse.json({ code: 0, data: [{ id: "reader", name, username: "reader" }] }),
    ),
  )
  const { wrapper, client, session } = setup()
  client.setQueryDefaults(announcementKeys.options(session), { staleTime: 300_000 })
  const first = renderHook(() => useAnnouncementDirectories(["user"]), { wrapper })
  await waitFor(() => expect(first.result.current.users.data?.[0]?.name).toBe("Old reader"))
  first.unmount()
  name = "Fresh reader"
  const second = renderHook(() => useAnnouncementDirectories(["user"]), { wrapper })
  await waitFor(() => expect(second.result.current.users.isFetching).toBe(false))
  expect(second.result.current.users.data?.[0]?.name).toBe("Fresh reader")
})
