import { z } from "zod"
const clientSchema = z
  .object({
    id: z.string().min(1),
    clientId: z.string(),
    nsp: z.string().min(1),
    transport: z.string(),
    handshake: z
      .object({
        address: z.string(),
        headers: z.record(z.unknown()),
        time: z.string(),
        url: z.string(),
        query: z.record(z.unknown()),
      })
      .passthrough(),
    rooms: z.array(z.string()),
  })
  .passthrough()
const aggregateSchema = z.object({
  timestamp: z.number().finite(),
  type: z.enum(["packetsIn", "packetsOut", "bytesIn", "bytesOut"]),
  count: z.number().finite().nonnegative(),
})
const serverSchema = z.object({
  serverId: z.string().min(1),
  hostname: z.string(),
  pid: z.number(),
  uptime: z.number().finite().nonnegative(),
  clientsCount: z.number().int().nonnegative(),
  pollingClientsCount: z.number().int().nonnegative(),
  namespaces: z.array(z.object({ name: z.string(), socketsCount: z.number().int().nonnegative() })),
  aggregatedEvents: z.array(aggregateSchema),
})
export type InstrumentClient = z.infer<typeof clientSchema>
export type InstrumentServer = z.infer<typeof serverSchema> & { lastUpdate: number }
export type InstrumentAggregate = z.infer<typeof aggregateSchema>
export type InstrumentMessage = {
  id: number
  type: "R" | "S"
  event: string
  args: unknown[]
  time: string
  nsp: string
  sid: string
}
export type InstrumentConnection = { id: number; type: "CONN" | "DISC"; time: string; nsp: string; sid: string }
export type InstrumentState = {
  servers: Map<string, InstrumentServer>
  clients: InstrumentClient[]
  history: InstrumentClient[]
  connections: InstrumentConnection[]
  messages: InstrumentMessage[]
  traffic: InstrumentAggregate[]
  sequence: number
}
export type InstrumentEvent =
  | { type: "snapshot"; clients: InstrumentClient[] }
  | { type: "stats"; server: z.infer<typeof serverSchema> }
  | { type: "connected"; client: InstrumentClient; time: string }
  | { type: "disconnected"; nsp: string; sid: string; time: string }
  | { type: "message"; direction: "R" | "S"; nsp: string; sid: string; event: string; args: unknown[]; time: string }
export function emptyInstrumentState(): InstrumentState {
  return { servers: new Map(), clients: [], history: [], connections: [], messages: [], traffic: [], sequence: 0 }
}
export function parseInstrumentEvent(event: string, args: unknown[]): InstrumentEvent | null {
  if (event === "all_sockets") {
    const parsed = z.array(clientSchema).safeParse(args[0])
    return parsed.success ? { type: "snapshot", clients: parsed.data } : null
  }
  if (event === "server_stats") {
    const parsed = serverSchema.safeParse(args[0])
    return parsed.success ? { type: "stats", server: parsed.data } : null
  }
  if (event === "socket_connected") {
    const parsed = z.tuple([clientSchema, z.string()]).safeParse(args)
    return parsed.success ? { type: "connected", client: parsed.data[0], time: parsed.data[1] } : null
  }
  if (event === "socket_disconnected") {
    const parsed = z.tuple([z.string(), z.string(), z.string(), z.string()]).safeParse(args)
    return parsed.success
      ? { type: "disconnected", nsp: parsed.data[0], sid: parsed.data[1], time: parsed.data[3] }
      : null
  }
  if (event === "event_received" || event === "event_sent") {
    const parsed = z
      .tuple([z.string(), z.string(), z.tuple([z.string()]).rest(z.unknown()), z.string()])
      .safeParse(args)
    return parsed.success
      ? {
          type: "message",
          direction: event === "event_received" ? "R" : "S",
          nsp: parsed.data[0],
          sid: parsed.data[1],
          event: parsed.data[2][0],
          args: parsed.data[2].slice(1),
          time: parsed.data[3],
        }
      : null
  }
  return null
}
export function instrumentClientKey(client: Pick<InstrumentClient, "id" | "nsp">) {
  return JSON.stringify([client.nsp, client.id])
}
function updateClient(list: InstrumentClient[], client: InstrumentClient, prepend = false) {
  const index = list.findIndex((item) => instrumentClientKey(item) === instrumentClientKey(client))
  if (index >= 0) return list.map((item, i) => (i === index ? client : item))
  return prepend ? [client, ...list] : [...list, client]
}
export function applyInstrumentEvent(state: InstrumentState, event: InstrumentEvent, now: number): InstrumentState {
  const recent = state.connections.filter((item) => Date.parse(item.time) > now - 600000)
  if (event.type === "stats") {
    const servers = new Map(state.servers)
    servers.set(event.server.serverId, { ...event.server, lastUpdate: now })
    return {
      ...state,
      servers,
      connections: recent,
      traffic: [...state.traffic, ...event.server.aggregatedEvents].filter((item) => item.timestamp > now - 600000),
    }
  }
  if (event.type === "snapshot") {
    let history = state.history
    for (const client of event.clients) history = updateClient(history, client, true)
    return { ...state, clients: event.clients, history, connections: recent }
  }
  const sequence = state.sequence + 1
  if (event.type === "connected") {
    const known = state.history.some((item) => instrumentClientKey(item) === instrumentClientKey(event.client))
    const history = updateClient(state.history, event.client, true)
    return {
      ...state,
      sequence,
      clients: updateClient(state.clients, event.client),
      history: known ? history : history.slice(0, 50),
      connections: [
        { id: sequence, type: "CONN", time: event.time, nsp: event.client.nsp, sid: event.client.id },
        ...recent,
      ],
    }
  }
  if (event.type === "disconnected") {
    const keep = (item: InstrumentClient) => item.nsp !== event.nsp || item.id !== event.sid
    return {
      ...state,
      sequence,
      clients: state.clients.filter(keep),
      history: state.history.filter(keep),
      connections: [{ id: sequence, type: "DISC", time: event.time, nsp: event.nsp, sid: event.sid }, ...recent],
    }
  }
  return {
    ...state,
    sequence,
    connections: recent,
    messages: [
      {
        id: sequence,
        type: event.direction,
        event: event.event,
        args: event.args,
        time: event.time,
        nsp: event.nsp,
        sid: event.sid,
      },
      ...state.messages,
    ].slice(0, 100),
  }
}
export function aggregateInstrumentServers(servers: Map<string, InstrumentServer>) {
  let total = 0,
    polling = 0
  const namespaces = new Map<string, number>()
  for (const server of servers.values()) {
    total += server.clientsCount
    polling += server.pollingClientsCount
    for (const nsp of server.namespaces) namespaces.set(nsp.name, (namespaces.get(nsp.name) ?? 0) + nsp.socketsCount)
  }
  return {
    total,
    polling,
    websocket: Math.max(0, total - polling),
    namespaces: Array.from(namespaces, ([name, socketsCount]) => ({ name, socketsCount })),
  }
}
export function instrumentChartRows(state: InstrumentState, now: number) {
  const connections = new Map<number, { timestamp: number; connected: number; disconnected: number }>(),
    traffic = new Map<number, { timestamp: number; received: number; sent: number }>()
  for (const event of state.connections) {
    const time = Date.parse(event.time)
    if (!Number.isFinite(time) || time <= now - 600000) continue
    const timestamp = Math.floor(time / 10000) * 10000,
      row = connections.get(timestamp) ?? { timestamp, connected: 0, disconnected: 0 }
    if (event.type === "CONN") row.connected++
    else row.disconnected++
    connections.set(timestamp, row)
  }
  for (const event of state.traffic) {
    if (event.timestamp <= now - 600000 || (event.type !== "bytesIn" && event.type !== "bytesOut")) continue
    const timestamp = Math.floor(event.timestamp / 10000) * 10000,
      row = traffic.get(timestamp) ?? { timestamp, received: 0, sent: 0 }
    if (event.type === "bytesIn") row.received += event.count
    else row.sent += event.count
    traffic.set(timestamp, row)
  }
  return {
    connections: [...connections.values()].sort((a, b) => a.timestamp - b.timestamp),
    traffic: [...traffic.values()].sort((a, b) => a.timestamp - b.timestamp),
  }
}

export const instrumentConnectionSchema = z.object({
  url: z
    .string()
    .trim()
    .url("socketInstrument.invalidUrl")
    .refine((value) => /^(https?|wss?):/.test(value), "socketInstrument.invalidUrl"),
  path: z.string().trim().min(1, "socketInstrument.requiredPath"),
  namespace: z.string(),
  username: z.string(),
  password: z.string(),
})
export type InstrumentConnectionInput = z.infer<typeof instrumentConnectionSchema>
export function buildInstrumentConnection(value: InstrumentConnectionInput) {
  const input = instrumentConnectionSchema.parse(value),
    endpoint = new URL(input.url)
  const namespace = input.namespace.startsWith("/") ? input.namespace : `/${input.namespace}`
  return {
    url: `${endpoint.origin}${namespace}${endpoint.search}`,
    path: input.path,
    auth: { username: input.username, password: input.password },
  }
}
export type InstrumentSocketConfig = ReturnType<typeof buildInstrumentConnection>
