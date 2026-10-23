// @vitest-environment jsdom
import "@test/setup/layout"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { announcementKeys } from "@/services/hooks/use-announcements"
import type { Announcement, AnnouncementList } from "@/services/api/announcement"
import i18n from "@/locales"
import AnnouncementPage from "@/views/notification/manage/announcements"
const base = "http://localhost:16000/api/v1/admin/notifications"
const draft: Announcement = {
  id: "draft",
  createTime: "",
  updateTime: "",
  displayMode: "inbox",
  source: "admin",
  category: "admin.announcement",
  level: "warning",
  contentMode: "raw",
  title: "Draft note",
  content: "Full body",
  status: "draft",
  mandatory: false,
}
async function setup(readOnly = false) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "announcement-page-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: !readOnly,
      roles: [],
      buttons: ["notification:read"],
    },
  })
  server.use(
    http.post(`${base}/banner-check`, () =>
      HttpResponse.json({
        code: 0,
        data: { revision: 1, serverNow: "2026-10-23T08:00:00Z", current: null, scheduled: null },
      }),
    ),
    http.get(base, () => HttpResponse.json({ code: 0, data: { records: [draft], page: 1, pageSize: 10, total: 1 } })),
  )
}
afterEach(() => useAuthStore.getState().clearAuth())
test("announcement filters send category, lifecycle status and display mode and reset to the first page", async () => {
  await setup()
  const queries: Record<string, string>[] = []
  server.use(
    http.get(base, ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json({ code: 0, data: { records: [draft], page: 1, pageSize: 10, total: 1 } })
    }),
  )
  renderAdmin(<AnnouncementPage />)
  const user = userEvent.setup()
  await screen.findByRole("button", { name: "Draft note" })
  await user.type(screen.getByRole("textbox", { name: "Category" }), "system.security")
  await user.click(screen.getByRole("combobox", { name: "Status" }))
  await user.click(await screen.findByRole("option", { name: "Scheduled" }))
  await user.click(screen.getByRole("combobox", { name: "Display mode" }))
  await user.click(await screen.findByRole("option", { name: "Top announcement" }))
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() =>
    expect(queries.at(-1)).toMatchObject({
      category: "system.security",
      status: "scheduled",
      displayMode: "top_banner",
      page: "1",
    }),
  )
  await user.click(screen.getByRole("button", { name: "Reset" }))
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue(""))
})
test("draft deletion requires confirmation and refreshes the list after the server accepts it", async () => {
  await setup()
  let deleted = false,
    deletes = 0
  server.use(
    http.get(base, () =>
      HttpResponse.json({
        code: 0,
        data: { records: deleted ? [] : [draft], page: 1, pageSize: 10, total: deleted ? 0 : 1 },
      }),
    ),
    http.delete(`${base}/draft`, () => {
      deletes++
      deleted = true
      return HttpResponse.json({ code: 0, data: null })
    }),
  )
  renderAdmin(<AnnouncementPage />)
  const user = userEvent.setup()
  await screen.findByRole("button", { name: "Draft note" })
  await user.click(screen.getByRole("button", { name: "More" }))
  await user.click(await screen.findByRole("menuitem", { name: "Delete draft" }))
  const dialog = await screen.findByRole("alertdialog", { name: "Delete draft" })
  expect(deletes).toBe(0)
  await user.click(within(dialog).getByRole("button", { name: "Delete draft" }))
  await waitFor(() => expect(deletes).toBe(1))
  await waitFor(() => expect(screen.queryByRole("button", { name: "Draft note" })).not.toBeInTheDocument())
})
test("read-only users can inspect details but receive no write or banner-preview controls", async () => {
  await setup(true)
  renderAdmin(<AnnouncementPage />)
  await screen.findByRole("button", { name: "Draft note" })
  expect(screen.getByRole("button", { name: "Details" })).toBeEnabled()
  expect(screen.queryByRole("button", { name: "New announcement" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Refresh status" })).not.toBeInTheDocument()
})
test("a pending confirmation closes when a refreshed lifecycle no longer permits the action", async () => {
  await setup()
  const { queryClient } = renderAdmin(<AnnouncementPage />)
  const user = userEvent.setup()
  await screen.findByRole("button", { name: "Draft note" })
  await user.click(screen.getByRole("button", { name: "More" }))
  await user.click(await screen.findByRole("menuitem", { name: "Delete draft" }))
  await screen.findByRole("alertdialog", { name: "Delete draft" })
  act(() => {
    for (const [key, data] of queryClient.getQueriesData<AnnouncementList>({
      queryKey: announcementKeys.all(getAuthSession()),
    }))
      if (data && Array.isArray(data.records))
        queryClient.setQueryData(key, { ...data, records: [{ ...draft, status: "published" }] })
  })
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
})

test("an unrelated banner refresh preserves an open row action menu", async () => {
  await setup()
  const { queryClient } = renderAdmin(<AnnouncementPage />)
  const user = userEvent.setup()
  await screen.findByRole("button", { name: "Draft note" })
  await user.click(screen.getByRole("button", { name: "More" }))
  await screen.findByRole("menuitem", { name: "Delete draft" })
  act(() => {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: announcementKeys.all(getAuthSession()) }))
      if (query.queryKey[2] === "banners")
        queryClient.setQueryData(query.queryKey, {
          revision: 2,
          serverNow: "2026-10-23T08:00:00Z",
          current: {
            id: "banner",
            displayMode: "top_banner",
            title: "New banner notice",
            content: "Body",
            contentMode: "raw",
            level: "info",
            status: "published",
          },
          scheduled: null,
        })
  })
  await screen.findByText("New banner notice")
  expect(screen.getByRole("menuitem", { name: "Delete draft" })).toBeVisible()
})
