import assert from "node:assert/strict"
export function instrumentFixtures() {
  const state = {
    connections: [],
    handshakes: 0,
    kicks: [],
    gate: null,
    failNext: false,
    stallOpening: false,
    clients: [],
  }
  const client = (id, nsp = "/", transport = "websocket") => ({
    id,
    clientId: `engine-${id}`,
    nsp,
    transport,
    handshake: {
      address: "127.0.0.1",
      headers: { host: "fixture.local", "x-fixture": "header-value" },
      time: new Date().toISOString(),
      url: "/socket.io/",
      query: { tag: ["one", "two"] },
    },
    rooms: [id, "room2", "room3", "room4", "room5", "room6", "room7"],
  })
  const stats = (serverId, clientsCount, pollingClientsCount, nsp) => ({
    serverId,
    hostname: `host-${serverId}`,
    pid: serverId === "alpha" ? 42 : 43,
    uptime: 3661,
    clientsCount,
    pollingClientsCount,
    namespaces: [{ name: nsp, socketsCount: clientsCount }],
    aggregatedEvents: [
      { timestamp: Date.now(), type: "bytesIn", count: 2048 },
      { timestamp: Date.now(), type: "bytesOut", count: 1024 },
      { timestamp: Date.now(), type: "packetsIn", count: 10 },
    ],
  })
  function packet(connection, event, ...args) {
    if (!connection.closed && connection.instrument)
      connection.socket.send(`42/admin,${JSON.stringify([event, ...args])}`)
  }
  function broadcast(event, ...args) {
    for (const c of state.connections) packet(c, event, ...args)
  }
  function seed(connection) {
    state.clients = [client("client-root"), client("client-chat", "/chat")]
    packet(connection, "all_sockets", state.clients)
    packet(connection, "server_stats", stats("alpha", 3, 1, "/"))
    packet(connection, "server_stats", stats("beta", 5, 0, "/chat"))
    packet(connection, "socket_connected", client("incremental"), new Date().toISOString())
    state.clients.push(client("incremental"))
    packet(connection, "socket_disconnected", "/", "incremental", "fixture close", new Date().toISOString())
    state.clients = state.clients.filter((c) => c.id !== "incremental")
    packet(connection, "event_received", "/", "client-root", ["incoming", false, null], new Date().toISOString())
    packet(connection, "event_sent", "/chat", "client-chat", ["outgoing", { ok: true }], new Date().toISOString())
  }
  function handler(socket) {
    const server = socket.connectToServer(),
      connection = {
        socket,
        server,
        closed: false,
        instrument: false,
        requestedAdmin: false,
        tenant: new URL(socket.url()).searchParams.get("tenant"),
      }
    state.connections.push(connection)
    if (state.stallOpening) {
      state.stallOpening = false
      connection.stalled = true
      // Keep the Engine.IO handshake pending until the real Manager timeout fires.
      server.onMessage(() => {})
      socket.onMessage(() => {})
      socket.onClose(() => {
        connection.closed = true
        server.close()
      })
      server.onClose(() => {})
      return
    }
    server.onMessage((data) => {
      if (connection.closed) return
      const text = String(data)
      if (text.startsWith("42/admin,")) return
      if (text.startsWith("40/admin,")) {
        state.handshakes++
        connection.instrument = true
        seed(connection)
        socket.send(data)
        return
      }
      socket.send(data)
    })
    socket.onMessage(async (data) => {
      if (connection.closed) return
      const text = String(data)
      if (text.startsWith("40/admin,")) {
        connection.requestedAdmin = true
        const auth = JSON.parse(text.slice(9))
        assert.equal(typeof auth.username, "string")
        assert.equal(typeof auth.password, "string")
        assert.deepEqual(Object.keys(auth).sort(), ["password", "username"])
        if (state.gate) await state.gate
        if (connection.closed) return
        if (state.failNext) {
          state.failNext = false
          socket.send('44/admin,{"message":"fixture authentication failed"}')
          return
        }
      }
      if (text.startsWith("42/admin,")) {
        const [event, nsp, close, sid] = JSON.parse(text.slice(9))
        assert.equal(event, "_disconnect")
        assert.equal(close, true)
        state.kicks.push({ nsp, close, sid })
        if (state.clients.some((c) => c.id === sid && c.nsp === nsp)) {
          state.clients = state.clients.filter((c) => c.id !== sid || c.nsp !== nsp)
          broadcast("socket_disconnected", nsp, sid, "server namespace disconnect", new Date().toISOString())
        }
        return
      }
      server.send(data)
    })
    socket.onClose(() => {
      connection.closed = true
      server.close()
    })
    server.onClose((code, reason) => {
      connection.closed = true
      socket.close({ code, reason })
    })
  }
  return { state, handler, broadcast, client, stats }
}
