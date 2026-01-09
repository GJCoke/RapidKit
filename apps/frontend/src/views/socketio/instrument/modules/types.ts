export interface ConnectConfig {
  url: string
  path: string
  namespace: string
  username: string
  password: string
}

export interface NamespaceInfo {
  name: string
  socketsCount: number
}

export interface ClientDetail {
  id: string
  clientId: string
  transport: string
  nsp: string
  handshake: {
    address: string
    headers: Record<string, string>
    time: string
    url: string
  }
  rooms: string[]
}

export interface AggregatedEvent {
  timestamp: number
  type: "packetsIn" | "packetsOut" | "bytesIn" | "bytesOut"
  count: number
}

export interface ServerStats {
  serverId: string
  hostname: string
  pid: number
  uptime: number
  clientsCount: number
  pollingClientsCount: number
  aggregatedEvents: AggregatedEvent[]
  namespaces: {
    name: string
    socketsCount: number
  }[]
}

export interface EventLog {
  type: "R" | "S" | "CONN" | "DISC"
  event: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
  time: string
  nsp: string
  sid: string
}
