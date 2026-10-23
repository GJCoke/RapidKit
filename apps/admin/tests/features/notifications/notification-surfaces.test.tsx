// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import { NotificationMessages } from "@/features/notifications/notification-messages"
import { GlobalAnnouncement } from "@/features/notifications/global-announcement"
import { invalidateNotificationBanner } from "@/services/hooks/use-notification-banner"
import { getAuthSession } from "@/services/auth-session"

const base = "http://localhost:16000/api/v1/notifications"
afterEach(() => useAuthStore.getState().clearAuth())
test("the message popover shows capped unread counts, full expandable content, tabs, mark-all and Escape", async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("one", "surface-refresh")
  let count = 120,
    allRead = false
  const queries: string[] = []
  server.use(
    http.get(`${base}/unread-count`, () => HttpResponse.json({ code: 0, data: { count } })),
    http.get(base, ({ request }) => {
      queries.push(new URL(request.url).search)
      return HttpResponse.json({
        code: 0,
        data: {
          items: [
            {
              id: "item",
              messageId: "message",
              title: "Long title",
              content: "Long message body",
              contentMode: "raw",
              level: "info",
              category: "admin.announcement",
              mandatory: true,
              status: "published",
              readAt: allRead ? "2026-10-23" : null,
              createTime: "2026-10-23T08:00:00Z",
            },
          ],
          size: 20,
        },
      })
    }),
    http.post(`${base}/read-all`, () => {
      allRead = true
      count = 0
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  const user = userEvent.setup()
  renderAdmin(<NotificationMessages />)
  await screen.findByText("99+")
  const trigger = screen.getByRole("button", { name: "Notifications" })
  await user.click(trigger)
  const dialog = await screen.findByRole("dialog", { name: "Messages" })
  await within(dialog).findByRole("button", { name: "Long title" })
  await user.click(within(dialog).getByRole("button", { name: "Expand message" }))
  expect(within(dialog).getByRole("button", { name: "Collapse message" })).toHaveAttribute("aria-expanded", "true")
  await user.click(within(dialog).getByRole("tab", { name: "Announcements" }))
  await waitFor(() => expect(queries.some((query) => query.includes("category=admin.announcement"))).toBe(true))
  await user.click(within(dialog).getByRole("button", { name: "Mark all read" }))
  await waitFor(() => expect(allRead).toBe(true))
  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})
test("banner details are independent of inbox reads and disappear immediately on revision invalidation", async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("one", "banner-surface-refresh")
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/top-banner`, async () => {
      if (++calls > 1) await gate
      return HttpResponse.json({
        code: 0,
        data: {
          current: {
            id: "banner",
            title: "Maintenance",
            content: "Banner full body",
            level: "warning",
            contentMode: "raw",
            status: "published",
          },
          revision: 1,
          serverNow: "2026-10-23T08:00:00Z",
        },
      })
    }),
  )
  const user = userEvent.setup(),
    { queryClient } = renderAdmin(<GlobalAnnouncement />)
  await user.click(await screen.findByRole("button", { name: "View details" }))
  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).getByText("Banner full body")).toBeVisible()
  act(() => invalidateNotificationBanner(queryClient, getAuthSession(), 2))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(screen.queryByText("Maintenance")).not.toBeInTheDocument()
  await act(async () => {
    release()
    await gate
  })
  expect(screen.queryByText("Maintenance")).not.toBeInTheDocument()
})

test("a failed mark-all while the first popover list loads restores the canceled list", async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("one", "mark-all-failure-refresh")
  let release!: () => void,
    lists = 0,
    writes = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/unread-count`, () => HttpResponse.json({ code: 0, data: { count: 1 } })),
    http.get(base, async () => {
      if (++lists === 1) await gate
      return HttpResponse.json({
        code: 0,
        data: {
          items: [
            {
              id: "item",
              messageId: "message",
              title: "Recovered notice",
              content: "Body",
              contentMode: "raw",
              level: "info",
              category: "admin.announcement",
              mandatory: false,
              status: "published",
              createTime: "2026-10-23T08:00:00Z",
            },
          ],
          size: 20,
        },
      })
    }),
    http.post(`${base}/read-all`, () => {
      writes++
      return HttpResponse.json({ code: 500, message: "Write failed", data: null })
    }),
  )
  const user = userEvent.setup()
  renderAdmin(<NotificationMessages />)
  try {
    await user.click(screen.getByRole("button", { name: "Notifications" }))
    const dialog = await screen.findByRole("dialog", { name: "Messages" })
    await waitFor(() => expect(lists).toBe(1))
    const markAll = within(dialog).getByRole("button", { name: "Mark all read" })
    await waitFor(() => expect(markAll).toBeEnabled())
    await user.click(markAll)
    await waitFor(() => expect(writes).toBe(1))
    act(() => release())
    await within(dialog).findByRole("button", { name: "Recovered notice" })
  } finally {
    release()
  }
})
