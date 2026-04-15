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
    query: Record<string, string>
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
  namespaces: NamespaceInfo[]
  lastUpdate?: number
}

export interface EventLog {
  type: "R" | "S" | "CONN" | "DISC"
  event: string
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
  time: string
  nsp: string
  sid: string
}
