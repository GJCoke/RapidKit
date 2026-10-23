import assert from "node:assert/strict"
export function chatFixtures() {
  const state = { connections: [], sent: [], handshakes: 0, failNext: false, connectGate: null, sequence: 0 }
  function packet(connection, message) {
    if (!connection.closed) connection.socket.send(`42/chat,${JSON.stringify(["message", message])}`)
  }
  function broadcast(group, content, sender = "Nobita") {
    const message = { id: `parity-${++state.sequence}`, sender, time: "12:30:00", type: "text", content }
    for (const connection of state.connections.filter((c) => !c.closed && c.group === group))
      packet(connection, message)
    return message
  }
  function system(connection, key) {
    const message = {
      id: `parity-system-${++state.sequence}`,
      sender: "System",
      time: "12:30:00",
      type: "system",
      content: { key: `page.socketio.chat.${key}`, params: { username: connection.username, group: connection.group } },
    }
    for (const member of state.connections.filter((c) => !c.closed && c.group === connection.group))
      packet(member, message)
  }
  function leave(connection) {
    if (connection.group) {
      connection.closed = true
      system(connection, "userLeft")
      connection.group = null
    } else connection.closed = true
  }
  function handler(socket) {
    const server = socket.connectToServer(),
      connection = {
        socket,
        server,
        username: null,
        group: null,
        closed: false,
        joins: 0,
        queryGroup: new URL(socket.url()).searchParams.get("group"),
      }
    state.connections.push(connection)
    server.onMessage((data) => {
      const value = String(data)
      if (value.startsWith("40/chat,")) state.handshakes++
      socket.send(data)
    })
    socket.onMessage(async (data) => {
      const value = String(data)
      if (value.startsWith("40/chat,")) {
        const auth = JSON.parse(value.slice(8))
        assert.equal(typeof auth.access_token, "string")
        connection.username = auth.display_name
        if (state.connectGate) await state.connectGate
        if (state.failNext) {
          state.failNext = false
          socket.send('44/chat,{"message":"fixture connection unavailable"}')
          return
        }
      }
      if (value.startsWith("42/chat,")) {
        const [event, payload] = JSON.parse(value.slice(8))
        if (event === "join") {
          assert.equal(payload, connection.queryGroup)
          connection.closed = false
          connection.group = payload
          connection.joins++
          system(connection, "userJoined")
          return
        }
        if (event === "message") {
          assert.equal(payload.group, connection.group)
          assert.equal(typeof payload.content, "string")
          state.sent.push({ sender: connection.username, ...payload })
          broadcast(payload.group, payload.content, connection.username)
          return
        }
      }
      if (value.startsWith("41/chat")) leave(connection)
      server.send(data)
    })
    socket.onClose(() => {
      leave(connection)
      server.close()
    })
    server.onClose((code, reason) => {
      leave(connection)
      socket.close({ code, reason })
    })
  }
  return { state, handler, broadcast, packet }
}
