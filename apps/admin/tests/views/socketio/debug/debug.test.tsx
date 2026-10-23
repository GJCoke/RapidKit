// @vitest-environment jsdom
import "@test/setup/layout"
import { act, cleanup, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import DebugPage from "@/views/socketio/debug"
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
const debug = vi.hoisted(() => ({
  status: "offline",
  logs: [] as {
    id: number
    time: number
    type: "info" | "receive"
    event?: string
    data?: unknown
    message?: { key: string; value: string }
  }[],
  connect: vi.fn(),
  disconnect: vi.fn(),
  clearLogs: vi.fn(),
  send: vi.fn(() => true),
}))
vi.mock("@/services/hooks/use-socket-debug", () => ({ useSocketDebug: () => debug }))
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "debug-ui")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: false,
      roles: [],
      buttons: ["socketio:read"],
      createTime: "",
      updateTime: "",
    },
  })
  const view = renderAdmin(<DebugPage />)
  return { user: userEvent.setup(), view }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  debug.status = "offline"
  debug.logs = []
  vi.clearAllMocks()
})
test("invalid authentication cannot connect and valid custom connection values reach the owned transport", async () => {
  const { user } = await setup()
  expect(screen.getByText("No messages yet")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Send Event" })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: "Advanced configuration" }))
  await user.clear(screen.getByRole("textbox", { name: "Auth Payload (JSON)" }))
  await user.type(screen.getByRole("textbox", { name: "Auth Payload (JSON)" }), "null")
  await user.click(screen.getByRole("button", { name: "Connect" }))
  expect(screen.getByText("Authentication must be a JSON object")).toBeInTheDocument()
  expect(debug.connect).not.toHaveBeenCalled()
  await user.clear(screen.getByRole("textbox", { name: "Auth Payload (JSON)" }))
  await user.click(screen.getByRole("textbox", { name: "Auth Payload (JSON)" }))
  await user.paste('{"key":"custom"}')
  await user.clear(screen.getByRole("textbox", { name: "URL" }))
  await user.type(screen.getByRole("textbox", { name: "URL" }), "https://debug.example.test")
  await user.clear(screen.getByRole("textbox", { name: "Path" }))
  await user.type(screen.getByRole("textbox", { name: "Path" }), "/custom")
  await user.clear(screen.getByRole("textbox", { name: "Namespace" }))
  await user.type(screen.getByRole("textbox", { name: "Namespace" }), "/room")
  await user.click(screen.getByRole("button", { name: "Connect" }))
  expect(debug.connect).toHaveBeenCalledWith({
    url: "https://debug.example.test/room",
    path: "/custom",
    auth: { key: "custom" },
  })
})
test("send JSON validation retains drafts, renders zero/null logs and translates status/log templates live", async () => {
  debug.status = "online"
  debug.logs = [
    { id: 1, time: 1700000000000, type: "receive", event: "number", data: 0 },
    { id: 2, time: 1700000000000, type: "receive", event: "empty", data: null },
    { id: 3, time: 1700000000000, type: "info", message: { key: "connected", value: "client-id" } },
  ]
  const { user } = await setup()
  expect(screen.getByText("0", { exact: true })).toBeInTheDocument()
  expect(screen.getByText("null", { exact: true })).toBeInTheDocument()
  const data = screen.getByRole("textbox", { name: "Data (JSON)" })
  await user.clear(data)
  await user.type(data, "bad json")
  await user.click(screen.getByRole("button", { name: "Send Event" }))
  expect(screen.getByText("Invalid JSON data")).toBeInTheDocument()
  expect(data).toHaveValue("bad json")
  expect(debug.send).not.toHaveBeenCalled()
  await user.clear(data)
  await user.type(data, "false")
  await user.click(screen.getByRole("button", { name: "Send Event" }))
  expect(debug.send).toHaveBeenCalledWith("message", false)
  await user.click(screen.getByRole("button", { name: "Clear" }))
  expect(debug.clearLogs).toHaveBeenCalledTimes(1)
  await act(async () => {
    await i18n.changeLanguage("zh-CN")
  })
  expect(screen.getByText("已连接（ID：client-id）")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "断开" })).toBeInTheDocument()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(screen.queryByText("client-id")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "发送事件" })).not.toBeInTheDocument()
})
