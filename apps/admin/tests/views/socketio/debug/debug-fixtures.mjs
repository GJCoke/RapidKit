import assert from "node:assert/strict"
export function debugFixtures() {
  const state = { connections: [], sent: [], failNext: false, gate: null, sequence: 0 }
  const prefix = "/custom-room,"
  function receive(event, ...args) {
    for (const connection of state.connections.filter((c) => c.online && !c.closed))
      connection.socket.send(`42${prefix}${JSON.stringify([event, ...args])}`)
  }
  function handler(socket) {
    const connection = {
      socket,
      online: false,
      closed: false,
      authKeys: [],
      url: new URL(socket.url()).origin,
      path: new URL(socket.url()).pathname,
      query: Object.fromEntries(new URL(socket.url()).searchParams),
    }
    state.connections.push(connection)
    socket.onMessage(async (data) => {
      const text = String(data)
      if (text.startsWith(`40${prefix}`)) {
        const auth = JSON.parse(text.slice(2 + prefix.length))
        assert.deepEqual(auth, { apiKey: "fixture-only" })
        connection.authKeys = Object.keys(auth)
        if (state.gate) await state.gate
        if (state.failNext) {
          state.failNext = false
          socket.send(`44${prefix}{"message":"fixture refused"}`)
          return
        }
        connection.online = true
        socket.send(`40${prefix}${JSON.stringify({ sid: `debug-${++state.sequence}` })}`)
      } else if (text.startsWith(`42${prefix}`)) {
        const [event, payload] = JSON.parse(text.slice(2 + prefix.length))
        state.sent.push({ event, payload })
        receive(event, payload)
      } else if (text.startsWith("41")) {
        connection.online = false
        connection.closed = true
      }
    })
    socket.onClose(() => {
      connection.closed = true
      connection.online = false
    })
    socket.send(
      JSON.stringify({
        sid: `engine-${state.connections.length}`,
        upgrades: [],
        pingInterval: 120000,
        pingTimeout: 120000,
        maxPayload: 1000000,
      }).replace(/^/, "0"),
    )
  }
  return { state, handler, receive }
}
