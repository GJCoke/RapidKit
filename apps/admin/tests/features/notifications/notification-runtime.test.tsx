// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useNotificationUnread } from "@/services/hooks/use-notifications"
import { NotificationRuntime } from "@/features/notifications/notification-runtime"
const socket = vi.hoisted(() => {
  const listeners = new Map<string, (payload: unknown) => void>()
  return {
    connected: false,
    listeners,
    on: vi.fn((event: string, callback: (payload: unknown) => void) => listeners.set(event, callback)),
    off: vi.fn((event: string) => listeners.delete(event)),
  }
})
const close = vi.hoisted(() => vi.fn())
vi.mock("@/services/app-socket", () => ({ openAppSocket: () => socket, closeAppSocket: close }))
afterEach(() => {
  useAuthStore.getState().clearAuth()
  socket.listeners.clear()
  vi.clearAllMocks()
})
function Count() {
  const count = useNotificationUnread()
  return <output aria-label="Count">{count.data?.count}</output>
}
test("notification socket listeners are released and retired-account events cannot change the current count", async () => {
  useAuthStore.getState().setToken("one", "runtime-one")
  server.use(
    http.get("http://localhost:16000/api/v1/notifications/unread-count", () =>
      HttpResponse.json({ code: 0, data: { count: 0 } }),
    ),
  )
  const view = renderAdmin(
    <>
      <NotificationRuntime />
      <Count />
    </>,
  )
  await waitFor(() => expect(screen.getByLabelText("Count")).toHaveTextContent("0"))
  const oldCount = socket.listeners.get("notification:unread-count")!
  act(() => socket.listeners.get("notification:unread-count")?.({ count: 5 }))
  await waitFor(() => expect(screen.getByLabelText("Count")).toHaveTextContent("5"))
  act(() => useAuthStore.getState().setToken("two", "runtime-two"))
  await waitFor(() => expect(screen.getByLabelText("Count")).toHaveTextContent("0"))
  act(() => oldCount({ count: 99 }))
  expect(screen.getByLabelText("Count")).toHaveTextContent("0")
  view.unmount()
  expect(close).toHaveBeenCalledTimes(2)
  expect(socket.listeners.size).toBe(0)
})
