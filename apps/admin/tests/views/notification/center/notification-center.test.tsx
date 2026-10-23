// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation } from "react-router"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"
import { normalizeRoutes } from "@/features/router/route-model"
import { getAuthSession } from "@/services/auth-session"
import { notificationKeys, recallNotification } from "@/services/hooks/use-notifications"
import type { NotificationMessage } from "@/services/api/notification"
import i18n from "@/locales"
import NotificationCenter from "@/views/notification/center"

const base = "http://localhost:16000/api/v1/notifications"
const message: NotificationMessage = {
  id: "inbox",
  messageId: "message",
  contentMode: "raw",
  title: "Private title",
  content: "Private body",
  level: "warning",
  category: "system.security",
  mandatory: true,
  status: "published",
  createTime: "2026-10-23T08:00:00Z",
  action: { type: "menu", route: "manage_user", path: "/manage/user", query: { keyword: "Lin" } },
}
async function setup(items = [message]) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("first", "refresh")
  useRouteStore
    .getState()
    .replaceSnapshot(normalizeRoutes([{ name: "manage_user", path: "/manage/user", component: "view.manage_user" }]))
  server.use(
    http.get(base, () => HttpResponse.json({ code: 0, data: { items, size: 20 } })),
    http.get(`${base}/unread-count`, () => HttpResponse.json({ code: 0, data: { count: 1 } })),
  )
}
afterEach(() => useAuthStore.getState().clearAuth())
function Location() {
  const value = useLocation()
  return (
    <output aria-label="Location">
      {value.pathname}
      {value.search}
    </output>
  )
}
test("notification center applies every server filter and can retry a failed list", async () => {
  await setup()
  const queries: Record<string, string>[] = [],
    user = userEvent.setup()
  let failed = true
  server.use(
    http.get(base, ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(
        failed ? { code: 500, message: "Unavailable", data: null } : { code: 0, data: { items: [], size: 20 } },
      )
    }),
  )
  renderAdmin(<NotificationCenter />)
  await user.click(await screen.findByRole("button", { name: "Retry" }))
  failed = false
  await user.click(await screen.findByRole("button", { name: "Retry" }))
  await screen.findByText("No messages")
  await user.click(screen.getByRole("checkbox", { name: "Unread only" }))
  await user.selectOptions(screen.getByLabelText("Archive state"), "all")
  await user.selectOptions(screen.getByLabelText("Level"), "warning")
  await user.type(screen.getByLabelText("Category"), "system.security")
  await user.tab()
  await user.type(screen.getByLabelText("Created from"), "2026-10-01")
  await user.tab()
  await user.type(screen.getByLabelText("Created to"), "2026-10-23")
  await user.tab()
  await waitFor(() =>
    expect(queries.at(-1)).toEqual({
      size: "20",
      unreadOnly: "true",
      archived: "all",
      level: "warning",
      category: "system.security",
      createdFrom: "2026-10-01",
      createdTo: "2026-10-23",
    }),
  )
})
test("reading navigates to an authorized action only after success, while archive and confirmed deletion are separate", async () => {
  await setup([
    message,
    { ...message, id: "archive", title: "Archive this" },
    { ...message, id: "delete", title: "Delete this" },
  ])
  const user = userEvent.setup(),
    calls: string[] = []
  server.use(
    http.patch(`${base}/inbox/read`, () => {
      calls.push("read")
      return HttpResponse.json({ code: 0, data: {} })
    }),
    http.patch(`${base}/archive/archive`, () => {
      calls.push("archive")
      return HttpResponse.json({ code: 0, data: {} })
    }),
    http.delete(`${base}/delete`, () => {
      calls.push("delete")
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  renderAdmin(
    <>
      <NotificationCenter />
      <Location />
    </>,
  )
  await user.click(await screen.findByRole("button", { name: "Private title" }))
  await waitFor(() => expect(screen.getByLabelText("Location")).toHaveTextContent("/manage/user?keyword=Lin"))
  await user.click(
    within(screen.getByRole("article", { name: "Archive this" })).getByRole("button", { name: "Archive" }),
  )
  await waitFor(() => expect(screen.queryByRole("article", { name: "Archive this" })).not.toBeInTheDocument())
  await user.click(within(screen.getByRole("article", { name: "Delete this" })).getByRole("button", { name: "Delete" }))
  expect(calls).toEqual(["read", "archive"])
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm" }))
  await waitFor(() => expect(screen.queryByRole("article", { name: "Delete this" })).not.toBeInTheDocument())
  expect(calls).toEqual(["read", "archive", "delete"])
})
test("a recall removes visible secrets and prevents action navigation even while a read is pending", async () => {
  await setup()
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.patch(`${base}/inbox/read`, async () => {
      started = true
      await gate
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  const user = userEvent.setup()
  const { queryClient } = renderAdmin(
    <>
      <NotificationCenter />
      <Location />
    </>,
  )
  await user.click(await screen.findByRole("button", { name: "Private title" }))
  await waitFor(() => expect(started).toBe(true))
  act(() => recallNotification(queryClient, getAuthSession(), "message"))
  await waitFor(() => expect(screen.queryByText("Private title")).not.toBeInTheDocument())
  expect(screen.queryByText("Private body")).not.toBeInTheDocument()
  await act(async () => {
    release()
    await gate
  })
  expect(screen.getByLabelText("Location")).toHaveTextContent("/")
  expect(screen.getByText("This message has been recalled")).toBeVisible()
})

test("refreshing through the page while an archive is pending cannot restore the archived card", async () => {
  await setup()
  let releaseArchive!: () => void,
    releaseRefresh!: () => void,
    reads = 0,
    archiving = false
  const archiveGate = new Promise<void>((resolve) => {
    releaseArchive = resolve
  })
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve
  })
  server.use(
    http.get(base, async () => {
      if (++reads > 1) await refreshGate
      return HttpResponse.json({ code: 0, data: { items: [message], size: 20 } })
    }),
    http.patch(`${base}/inbox/archive`, async () => {
      archiving = true
      await archiveGate
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  const user = userEvent.setup(),
    { queryClient } = renderAdmin(<NotificationCenter />)
  try {
    const article = await screen.findByRole("article", { name: "Private title" })
    await user.click(within(article).getByRole("button", { name: "Archive" }))
    await waitFor(() => expect(archiving).toBe(true))
    await user.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() => expect(reads).toBe(2))
    act(() => releaseArchive())
    await waitFor(() => expect(screen.queryByRole("article", { name: "Private title" })).not.toBeInTheDocument())
    act(() => releaseRefresh())
    await waitFor(() =>
      expect(queryClient.isFetching({ queryKey: notificationKeys.inboxes(getAuthSession()) })).toBe(0),
    )
    expect(screen.queryByRole("article", { name: "Private title" })).not.toBeInTheDocument()
  } finally {
    releaseArchive()
    releaseRefresh()
  }
})
