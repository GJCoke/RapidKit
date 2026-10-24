// @vitest-environment jsdom
import "@test/setup/layout"
import { act, cleanup, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import {
  emptyInstrumentState,
  parseInstrumentEvent,
  applyInstrumentEvent,
  type InstrumentState,
} from "@/views/socketio/instrument/modules/instrument-model"
import InstrumentPage from "@/views/socketio/instrument"
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
const instrument = vi.hoisted(() => ({
  data: null as InstrumentState | null,
  status: "offline",
  hasConnection: false,
  now: Date.now(),
  error: null as string | null,
  notice: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  kickClient: vi.fn(),
  removeServer: vi.fn(),
}))
vi.mock("@/services/hooks/use-socket-instrument", () => ({
  useSocketInstrument: () => ({ ...instrument, data: instrument.data ?? emptyInstrumentState() }),
}))
const client = {
  id: "one",
  clientId: "engine-one",
  nsp: "/chat",
  transport: "websocket",
  handshake: {
    address: "127.0.0.1",
    headers: { host: "localhost", "x-test": "header-value" },
    time: "2026-10-24T01:00:00Z",
    url: "/socket.io/",
    query: { tag: ["a", "b"] },
  },
  rooms: ["one", "room2", "room3", "room4", "room5", "room6", "room7"],
}
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "instrument-ui")
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
  renderAdmin(<InstrumentPage />)
  return userEvent.setup()
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  instrument.data = null
  instrument.status = "offline"
  instrument.hasConnection = false
  instrument.error = null
  instrument.now = Date.now()
  vi.clearAllMocks()
})
test("connection form exposes username/password/namespace and sends exact custom credentials while invalid URL is rejected", async () => {
  const user = await setup()
  expect(screen.getByText("No namespaces")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Advanced configuration" }))
  const url = screen.getByRole("textbox", { name: "URL" })
  await user.clear(url)
  await user.type(url, "invalid")
  await user.click(screen.getByRole("button", { name: "Connect" }))
  expect(screen.getByText("Enter a valid Socket.IO URL")).toBeInTheDocument()
  expect(instrument.connect).not.toHaveBeenCalled()
  await user.clear(url)
  await user.type(url, "https://instrument.example.test?tenant=one")
  await user.clear(screen.getByRole("textbox", { name: "Username" }))
  await user.type(screen.getByRole("textbox", { name: "Username" }), "monitor")
  await user.clear(screen.getByLabelText("Password"))
  await user.type(screen.getByLabelText("Password"), " exact password ")
  await user.click(screen.getByRole("button", { name: "Connect" }))
  expect(instrument.connect).toHaveBeenCalledWith({
    url: "https://instrument.example.test/admin?tenant=one",
    path: "/socket.io",
    auth: { username: "monitor", password: " exact password " },
  })
})
test("client history opens full handshake details, copies ids and confirms or cancels disconnect; namespace and offline server actions stay local", async () => {
  let data = emptyInstrumentState()
  for (const [event, args] of [
    ["all_sockets", [[client]]],
    [
      "server_stats",
      [
        {
          serverId: "server-a",
          hostname: "host-a",
          pid: 42,
          uptime: 3661,
          clientsCount: 2,
          pollingClientsCount: 1,
          namespaces: [{ name: "/chat", socketsCount: 1 }],
          aggregatedEvents: [],
        },
      ],
    ],
    ["event_received", ["/chat", "one", ["message", false], new Date().toISOString()]],
  ] as const) {
    const parsed = parseInstrumentEvent(event, [...args])
    if (!parsed) throw new Error("invalid test fixture")
    data = applyInstrumentEvent(data, parsed, Date.now() - 11000)
  }
  instrument.data = data
  instrument.status = "online"
  instrument.hasConnection = true
  const user = await setup(),
    copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
  await user.click(screen.getByRole("button", { name: "Connection history" }))
  let sheet = screen.getByRole("dialog", { name: "Connected Sockets History" })
  await user.click(within(sheet).getByRole("button", { name: "View client one" }))
  const detail = screen.getByRole("dialog", { name: "Client Handshake Detail" })
  expect(within(detail).getByText("engine-one")).toBeInTheDocument()
  expect(within(detail).getByText("room7")).toBeInTheDocument()
  expect(within(detail).getByText("header-value")).toBeInTheDocument()
  await user.click(within(detail).getByRole("tab", { name: "Query Parameters" }))
  expect(within(detail).getByText(/"tag"/)).toHaveTextContent('"a"')
  await user.click(within(detail).getByRole("button", { name: "Copy Socket ID" }))
  expect(copy).toHaveBeenCalledWith("one")
  await user.click(within(detail).getByRole("button", { name: "Close" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Client Handshake Detail" })).not.toBeInTheDocument())
  sheet = screen.getByRole("dialog", { name: "Connected Sockets History" })
  await user.click(within(sheet).getByRole("button", { name: "Disconnect client one" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }))
  expect(instrument.kickClient).not.toHaveBeenCalled()
  await user.click(within(sheet).getByRole("button", { name: "Disconnect client one" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Disconnect" }))
  expect(instrument.kickClient).toHaveBeenCalledWith(expect.objectContaining({ id: "one", nsp: "/chat" }))
  await user.click(within(sheet).getByRole("button", { name: "Close" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Connected Sockets History" })).not.toBeInTheDocument(),
  )
  await user.click(screen.getByRole("button", { name: "View clients in /chat" }))
  expect(screen.getByRole("dialog", { name: "Clients in /chat namespace" })).toBeInTheDocument()
  await user.click(
    within(screen.getByRole("dialog", { name: "Clients in /chat namespace" })).getByRole("button", { name: "Close" }),
  )
  await user.click(screen.getByRole("button", { name: "Remove server host-a" }))
  expect(instrument.removeServer).toHaveBeenCalledWith("server-a")
  await act(async () => {
    await i18n.changeLanguage("zh-CN")
  })
  expect(screen.getByText("接收")).toBeInTheDocument()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(screen.queryByRole("button", { name: "连接记录" })).not.toBeInTheDocument()
})

test("offline automatic reconnection keeps a disconnect action available to cancel the owned connection", async () => {
  instrument.status = "offline"
  instrument.hasConnection = true
  const user = await setup()
  await user.click(screen.getByRole("button", { name: "Disconnect" }))
  expect(instrument.disconnect).toHaveBeenCalledTimes(1)
})
