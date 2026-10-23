// @vitest-environment jsdom
import "@test/setup/layout"
import { act, cleanup, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import ChatPage from "@/views/socketio/chat"
const connections = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  sockets: [] as {
    connected: boolean
    handlers: Map<string, (...args: unknown[]) => void>
    emit: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    off: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock("@/services/app-socket", () => ({
  openPrivateAppSocket: connections.open.mockImplementation(() => {
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const socket = {
      connected: true,
      handlers,
      emit: vi.fn(),
      connect: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
      off: vi.fn((event: string) => handlers.delete(event)),
    }
    connections.sockets.push(socket)
    return socket
  }),
  closeAppSocket: connections.close,
}))
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "chat-ui")
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
  renderAdmin(<ChatPage />)
  return userEvent.setup()
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  connections.open.mockClear()
  connections.close.mockClear()
  connections.sockets.length = 0
})
async function join(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Join ${name}` }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm" }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
}
test("joining requires confirmation, rejects duplicate identity/room, limits four windows and releases a slot on close", async () => {
  const user = await setup()
  await user.click(screen.getByRole("button", { name: "Join Doraemon" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }))
  expect(connections.open).not.toHaveBeenCalled()
  await join(user, "Doraemon")
  await join(user, "Doraemon")
  expect(screen.getByRole("alert")).toHaveTextContent("already in")
  await act(async () => {
    await i18n.changeLanguage("zh-CN")
  })
  expect(screen.getByRole("alert")).toHaveTextContent('哆啦A梦 已经在 "大雄的家" 房间中了')
  await act(async () => {
    await i18n.changeLanguage("en-US")
  })
  expect(connections.open).toHaveBeenCalledTimes(1)
  for (const name of ["Nobita", "Shizuka", "Gian"]) await join(user, name)
  for (const name of ["Doraemon", "Nobita", "Shizuka", "Gian", "Suneo"])
    expect(screen.getByRole("button", { name: `Join ${name}` })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: /Close Doraemon/ }))
  expect(connections.close).toHaveBeenCalledWith(connections.sockets[0])
  expect(screen.getByRole("button", { name: "Join Suneo" })).toBeEnabled()
  await user.click(screen.getByRole("combobox", { name: "Target Room" }))
  await user.click(screen.getByRole("option", { name: "Secret Base" }))
  await join(user, "Doraemon")
  expect(connections.open).toHaveBeenLastCalledWith("/chat", { display_name: "Doraemon" }, { group: "Secret-Base" })
  expect(screen.getByRole("region", { name: "Doraemon · Secret Base" })).toBeInTheDocument()
})
test("text and system messages preserve self alignment, localize on language changes, and disconnected drafts survive until reconnect", async () => {
  const user = await setup()
  await join(user, "Doraemon")
  const window = screen.getByRole("region", { name: "Doraemon · Nobi's Home" }),
    input = within(window).getByRole("textbox")
  await user.type(input, "  hello  {Enter}")
  expect(connections.sockets[0].emit).toHaveBeenCalledWith("message", { content: "  hello  ", group: "Nobis-Home" })
  expect(input).toHaveValue("")
  const emit = (value: unknown) => act(() => connections.sockets[0].handlers.get("message")?.(value))
  emit({ id: "self", sender: "Doraemon", time: "12:30:00", type: "text", content: "<script>literal</script>" })
  emit({ id: "other", sender: "Nobita", time: "12:31:00", type: "text", content: "reply" })
  emit({
    id: "system",
    sender: "System",
    time: "12:32:00",
    type: "system",
    content: { key: "page.socketio.chat.userJoined", params: { username: "Nobita", group: "Nobis-Home" } },
  })
  expect(within(window).getByText("<script>literal</script>").closest('[data-slot="message"]')).toHaveAttribute(
    "data-align",
    "end",
  )
  expect(within(window).getByText("reply").closest('[data-slot="message"]')).toHaveAttribute("data-align", "start")
  expect(within(window).getByText("User Nobita has joined the group Nobi's Home")).toBeInTheDocument()
  expect(within(window).getByText("12:30:00")).toBeInTheDocument()
  await user.type(input, "unsent draft")
  connections.sockets[0].connected = false
  act(() => connections.sockets[0].handlers.get("disconnect")?.("transport close"))
  expect(within(window).getByRole("button", { name: "Send" })).toBeDisabled()
  expect(input).toHaveValue("unsent draft")
  await user.click(within(window).getByRole("button", { name: "Reconnect" }))
  expect(connections.sockets[0].connect).toHaveBeenCalledTimes(1)
  await act(async () => {
    await i18n.changeLanguage("zh-CN")
  })
  expect(screen.getByText("用户 野比大雄 已加入群组 大雄的家")).toBeInTheDocument()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(screen.queryByText("reply")).not.toBeInTheDocument()
  expect(connections.close).toHaveBeenCalledWith(connections.sockets[0])
})
