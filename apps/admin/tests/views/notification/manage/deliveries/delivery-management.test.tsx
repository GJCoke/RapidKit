// @vitest-environment jsdom
import "@test/setup/layout"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import type { Delivery, DeliveryMessage } from "@/services/api/notification-delivery"
import { toast } from "@rapidkit/ui"
import DeliveryPage from "@/views/notification/manage/deliveries"
const root = "http://localhost:16000/api/v1/admin",
  id = "10000000-0000-4000-8000-000000000001"
const message: DeliveryMessage = {
  id,
  title: "Delivery notice",
  category: "admin.announcement",
  contentMode: "raw",
  status: "published",
  titles: {},
  createTime: "2026-10-01T00:00:00",
}
const row: Delivery = {
  id: "20000000-0000-4000-8000-000000000001",
  messageId: id,
  userId: "30000000-0000-4000-8000-000000000001",
  channel: "in_app",
  status: "dead",
  attemptCount: 3,
  lastErrorCode: "inapp_emit_failed",
  createTime: "2026-10-01T00:00:00",
  updateTime: "2026-10-02T00:00:00",
  recipient: { name: "Ada", username: "ada", department: "Platform", state: "active" },
  message,
}
function reply(data: unknown) {
  return HttpResponse.json({ code: 0, data })
}
beforeEach(async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "delivery-ui-refresh")
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
  server.use(
    http.get(`${root}/notifications`, () =>
      reply({
        records: [
          { ...message, content: "Body", displayMode: "inbox", source: "admin", level: "info", mandatory: false },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ),
    http.get(`${root}/notification-deliveries/:id/summary`, () =>
      reply({ messageId: id, byStatus: { dead: 2, sent: 1 }, message }),
    ),
    http.get(`${root}/notification-deliveries`, () => reply({ records: [row], page: 1, pageSize: 20, total: 1 })),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
})
test("recent message first selection renders six counts and filtering sends status then resets it", async () => {
  const statuses: (string | null)[] = []
  server.use(
    http.get(`${root}/notification-deliveries`, ({ request }) => {
      statuses.push(new URL(request.url).searchParams.get("status"))
      return reply({ records: [row], page: 1, pageSize: 20, total: 1 })
    }),
  )
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  await screen.findByText("Ada")
  const summary = screen.getByRole("region", { name: "Delivery summary" })
  expect(within(summary).getAllByRole("button")).toHaveLength(6)
  await user.click(within(summary).getByRole("button", { name: "Failed: 2" }))
  await waitFor(() => expect(statuses.at(-1)).toBe("dead"))
  await user.click(screen.getByRole("button", { name: "Clear filter" }))
  await waitFor(() => expect(statuses.at(-1)).toBeNull())
  expect(screen.getByText("@ada · Platform")).toBeInTheDocument()
  expect(screen.getByText("Real-time channel failed")).toBeInTheDocument()
})
test("manual UUID lookup works without announcement read permission and invalid IDs never query", async () => {
  let lists = 0,
    messageReads = 0
  useAuthStore.setState({
    userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-delivery:read"] },
  })
  server.use(
    http.get(`${root}/notifications`, () => {
      messageReads++
      return reply({ records: [] })
    }),
    http.get(`${root}/notification-deliveries`, () => {
      lists++
      return reply({ records: [row], page: 1, pageSize: 20, total: 1 })
    }),
  )
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  expect(screen.queryByRole("combobox", { name: "Select message" })).toBeNull()
  const input = screen.getByRole("textbox", { name: "Message ID" })
  await user.type(input, "bad")
  expect(screen.getByText("Enter a valid UUID message ID")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled()
  expect(lists).toBe(0)
  await user.clear(input)
  await user.type(input, ` ${id.toUpperCase()} `)
  await user.keyboard("{Enter}")
  await screen.findByText("Ada")
  expect(messageReads).toBe(0)
  expect(screen.queryByRole("button", { name: /Retry \d+ failed/ })).toBeNull()
  expect(screen.queryByRole("button", { name: "View message" })).toBeNull()
})
test("delivery details expose outcome, technical data and the failed-record workbench action", async () => {
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  await user.click(await screen.findByRole("button", { name: "Details" }))
  const detail = await screen.findByRole("dialog", { name: "Delivery details" })
  expect(within(detail).getByRole("heading", { name: "Delivery failed" })).toBeInTheDocument()
  expect(within(detail).getByText("3 attempts")).toBeInTheDocument()
  expect(within(detail).getByText("Real-time channel failed")).toBeInTheDocument()
  await user.click(within(detail).getByText("Technical information", { selector: "summary" }))
  expect(within(detail).getByText("inapp_emit_failed")).toBeVisible()
  expect(within(detail).getByText(row.id)).toBeVisible()
  await user.click(within(detail).getByRole("button", { name: "Back to workbench" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(screen.getByRole("button", { name: "Clear filter" })).toBeInTheDocument()
})
test("retry failure remains confirmed; pending dismissal preserves the request and refreshes the accepted result", async () => {
  let accepted = false
  let fail = true,
    calls = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.post(`${root}/notification-deliveries/:id/retry-failed`, async () => {
      calls++
      if (!fail) {
        await gate
        accepted = true
      }
      return fail ? HttpResponse.json({ code: 500, message: "Failed", data: null }) : reply({ retried: 2 })
    }),
  )
  server.use(
    http.get(`${root}/notification-deliveries/:id/summary`, () =>
      reply({ messageId: id, byStatus: { dead: accepted ? 0 : 2, sent: 1 }, message }),
    ),
  )
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  const button = await screen.findByRole("button", { name: "Retry 2 failed" })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  const dialog = await screen.findByRole("alertdialog", { name: "Retry failed deliveries" })
  expect(calls).toBe(0)
  await user.click(within(dialog).getByRole("button", { name: "Confirm retry" }))
  await within(dialog).findByText("Could not retry deliveries. Please try again.")
  expect(dialog).toBeInTheDocument()
  fail = false
  try {
    await user.click(within(dialog).getByRole("button", { name: "Confirm retry" }))
    await waitFor(() => expect(calls).toBe(2))
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled()
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled()
    release()
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry 0 failed" })).toBeDisabled())
    expect(calls).toBe(2)
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  } finally {
    release()
  }
})
test("permission revocation closes a confirmation and restoring permission never revives it", async () => {
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  const button = await screen.findByRole("button", { name: "Retry 2 failed" })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  await screen.findByRole("alertdialog")
  act(() =>
    useAuthStore.setState({
      userInfo: {
        ...useAuthStore.getState().userInfo!,
        isAdmin: false,
        buttons: ["notification-delivery:read", "notification:read"],
      },
    }),
  )
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(screen.queryByRole("button", { name: /Retry \d+ failed/ })).toBeNull()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
  expect(screen.queryByRole("alertdialog")).toBeNull()
})
test("recent-list, summary and record failures retry independently and empty results switch language", async () => {
  let fail = true
  server.use(
    http.get(`${root}/notification-deliveries/:id/summary`, () =>
      fail
        ? HttpResponse.json({ code: 500, message: "Failed", data: null })
        : reply({ messageId: id, byStatus: {}, message }),
    ),
    http.get(`${root}/notification-deliveries`, () =>
      fail
        ? HttpResponse.json({ code: 500, message: "Failed", data: null })
        : reply({ records: [], page: 1, pageSize: 20, total: 0 }),
    ),
  )
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  await screen.findByText("Could not load the delivery summary. Please refresh.")
  await screen.findByText("Could not load delivery records. Please refresh.")
  expect(screen.getByRole("button", { name: "Retry 0 failed" })).toBeDisabled()
  fail = false
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  await screen.findByText("No delivery data found")
  await act(() => i18n.changeLanguage("zh-CN"))
  expect(screen.getByText("暂未查询到投递数据")).toBeInTheDocument()
})

test("technical fields copy exact values and explain clipboard failures without losing the details", async () => {
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  await user.click(await screen.findByRole("button", { name: "Details" }))
  const detail = await screen.findByRole("dialog", { name: "Delivery details" })
  await user.click(within(detail).getByText("Technical information", { selector: "summary" }))
  await user.click(within(detail).getByRole("button", { name: "Copy Delivery ID" }))
  expect(await navigator.clipboard.readText()).toBe(row.id)
  const error = vi.spyOn(toast, "error"),
    write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"))
  await user.click(within(detail).getByRole("button", { name: "Copy Message ID" }))
  await waitFor(() => expect(error).toHaveBeenCalledWith("Copy failed. Select and copy the value manually."))
  expect(write).toHaveBeenCalledWith(id)
  expect(detail).toBeInTheDocument()
})
test("message detail safely renders i18n parameters and closes when message-read permission is revoked", async () => {
  server.use(
    http.get(`${root}/notifications/${id}`, () =>
      reply({
        ...message,
        contentMode: "i18n",
        title: "common.success",
        content: "common.cancel",
        contentParams: { returnDetails: true, lng: "zh-CN" },
        source: "admin",
        displayMode: "inbox",
        level: "info",
        mandatory: false,
      }),
    ),
  )
  const user = userEvent.setup()
  renderAdmin(<DeliveryPage />)
  await user.click(await screen.findByRole("button", { name: "View message" }))
  const detail = await screen.findByRole("dialog", { name: "Announcement details" })
  expect(await within(detail).findByRole("heading", { name: "Success" })).toBeInTheDocument()
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-delivery:read"] },
    }),
  )
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(screen.queryByRole("button", { name: "View message" })).toBeNull()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
  expect(screen.queryByRole("dialog")).toBeNull()
})
