import { expect, test, vi } from "vitest"
import { io, Manager } from "socket.io-client"
import {
  parseInstrumentEvent,
  instrumentConnectionSchema,
  buildInstrumentConnection,
  emptyInstrumentState,
  applyInstrumentEvent,
  aggregateInstrumentServers,
  instrumentChartRows,
  type InstrumentState,
} from "@/views/socketio/instrument/modules/instrument-model"
const now = 1700000000000
const client = (id: string, nsp = "/") => ({
  id,
  nsp,
  clientId: `engine-${id}`,
  transport: "websocket",
  handshake: {
    address: "127.0.0.1",
    headers: { host: "localhost" },
    time: new Date(now).toISOString(),
    url: "/socket.io/",
    query: { tag: ["one", "two"] },
  },
  rooms: [id, "room-1"],
})
const server = (serverId: string, clientsCount: number, pollingClientsCount: number) => ({
  serverId,
  hostname: `host-${serverId}`,
  pid: 42,
  uptime: 3661,
  clientsCount,
  pollingClientsCount,
  namespaces: [{ name: "/", socketsCount: clientsCount }],
  aggregatedEvents: [{ timestamp: now, type: "bytesIn", count: 2048 }],
})
function receive(state: InstrumentState, event: string, args: unknown[], time = now) {
  const parsed = parseInstrumentEvent(event, args)
  expect(parsed).not.toBeNull()
  return applyInstrumentEvent(state, parsed!, time)
}
test("server snapshots replace per server rather than double-counting, preserve repeated query values and ignore malformed packets", () => {
  let state = receive(emptyInstrumentState(), "server_stats", [server("a", 2, 1)])
  state = receive(state, "server_stats", [server("b", 3, 0)])
  state = receive(state, "server_stats", [server("a", 4, 2)], now + 2000)
  expect(aggregateInstrumentServers(state.servers)).toEqual({
    total: 7,
    polling: 2,
    websocket: 5,
    namespaces: [{ name: "/", socketsCount: 7 }],
  })
  expect(state.servers.get("a")?.lastUpdate).toBe(now + 2000)
  state = receive(state, "all_sockets", [[client("a")]])
  expect(state.clients[0].handshake.query).toEqual({ tag: ["one", "two"] })
  expect(parseInstrumentEvent("all_sockets", [[{ id: "incomplete" }]])).toBeNull()
  expect(parseInstrumentEvent("server_stats", [{ ...server("bad", 1, 0), aggregatedEvents: "invalid" }])).toBeNull()
  expect(parseInstrumentEvent("irrelevant", [])).toBeNull()
})
test("snapshot and incremental clients merge by namespace and socket id, update metadata and remove only the disconnected pair", () => {
  let state = receive(emptyInstrumentState(), "all_sockets", [[client("same", "/"), client("same", "/chat")]])
  state = receive(state, "socket_connected", [
    { ...client("same", "/chat"), transport: "polling" },
    new Date(now).toISOString(),
  ])
  expect(state.clients).toHaveLength(2)
  expect(state.history).toHaveLength(2)
  expect(state.history.find((c) => c.nsp === "/chat")?.transport).toBe("polling")
  state = receive(state, "socket_disconnected", [
    "/chat",
    "same",
    "transport close",
    new Date(now + 1000).toISOString(),
  ])
  expect(state.clients.map((c) => c.nsp)).toEqual(["/"])
  expect(state.history.map((c) => c.nsp)).toEqual(["/"])
  expect(state.connections.map((e) => e.type)).toEqual(["DISC", "CONN"])
})
test("incremental connection history retains 50 unique clients and message history retains 100 without dropping connection chart data", () => {
  let state = emptyInstrumentState()
  for (let index = 0; index < 55; index++)
    state = receive(state, "socket_connected", [client(`client-${index}`), new Date(now + index).toISOString()])
  expect(state.history).toHaveLength(50)
  expect(state.history[0].id).toBe("client-54")
  expect(state.clients).toHaveLength(55)
  for (let index = 0; index < 105; index++)
    state = receive(state, index % 2 ? "event_sent" : "event_received", [
      "/",
      "client-54",
      ["custom", index, false, null],
      new Date(now + index).toISOString(),
    ])
  expect(state.messages).toHaveLength(100)
  expect(state.messages[0]).toMatchObject({ type: "R", event: "custom", args: [104, false, null] })
  expect(state.connections).toHaveLength(55)
})
test("connection and byte traffic charts bucket into ten seconds, exclude expired data and do not count packets as bytes", () => {
  let state = receive(emptyInstrumentState(), "socket_connected", [client("one"), new Date(now).toISOString()])
  state = receive(state, "socket_disconnected", ["/", "one", "close", new Date(now + 5000).toISOString()])
  state = receive(state, "server_stats", [
    {
      ...server("a", 1, 0),
      aggregatedEvents: [
        { timestamp: now, type: "bytesIn", count: 1024 },
        { timestamp: now + 5000, type: "bytesIn", count: 1024 },
        { timestamp: now, type: "bytesOut", count: 512 },
        { timestamp: now, type: "packetsIn", count: 99 },
        { timestamp: now - 600001, type: "bytesOut", count: 4096 },
      ],
    },
  ])
  expect(instrumentChartRows(state, now + 5000)).toEqual({
    connections: [{ timestamp: 1700000000000, connected: 1, disconnected: 1 }],
    traffic: [{ timestamp: 1700000000000, received: 2048, sent: 512 }],
  })
  expect(instrumentChartRows(state, now + 605001)).toEqual({ connections: [], traffic: [] })
})

test("instrument connection config preserves explicit admin credentials and URL queries without injecting application tokens", () => {
  const input = {
    url: "https://instrument.example.test?tenant=one",
    path: "/custom",
    namespace: "/admin",
    username: "admin-user",
    password: " exact password ",
  }
  expect(buildInstrumentConnection(input)).toEqual({
    url: "https://instrument.example.test/admin?tenant=one",
    path: "/custom",
    auth: { username: "admin-user", password: " exact password " },
  })
  expect(instrumentConnectionSchema.safeParse({ ...input, url: "javascript:alert(1)" }).success).toBe(false)
  expect(buildInstrumentConnection({ ...input, username: "", password: "" }).auth).toEqual({
    username: "",
    password: "",
  })
})

test("the explicit namespace overrides a URL pathname and reaches Socket.IO without changing Unicode", () => {
  const factory = vi.spyOn(Manager.prototype, "socket")
  try {
    for (const namespace of ["/", "/admin", "/监控"]) {
      const config = buildInstrumentConnection({
        url: "https://instrument.example.test/admin?tenant=one",
        path: "/socket.io",
        namespace,
        username: "monitor",
        password: "explicit",
      })
      const socket = io(config.url, { autoConnect: false, forceNew: true, path: config.path, auth: config.auth })
      expect(factory.mock.calls.at(-1)?.[0]).toBe(namespace)
      expect(socket.io.opts.query).toEqual({ tenant: "one" })
      socket.disconnect()
    }
  } finally {
    factory.mockRestore()
  }
})
