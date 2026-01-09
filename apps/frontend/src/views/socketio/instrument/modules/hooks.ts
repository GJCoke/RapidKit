import { ref, computed } from "vue"
import { useMessage } from "naive-ui"
import dayjs from "dayjs"
import { useSocket } from "@/hooks/business/socket"
import type { ClientDetail, ServerStats, AggregatedEvent, EventLog, ConnectConfig } from "./types"

export function useInstrumentSocket() {
  const message = useMessage()

  // 基础状态
  const serversMap = ref<Map<string, ServerStats>>(new Map())
  const clients = ref<ClientDetail[]>([])
  const connectedHistory = ref<ClientDetail[]>([])
  const allEvents = ref<AggregatedEvent[]>([])
  const events = ref<EventLog[]>([])

  // 计算属性
  const serversList = computed(() => Array.from(serversMap.value.values()))

  const aggregatedStats = computed(() => {
    const list = serversList.value
    if (list.length === 0) {
      return { clientsCount: 0, pollingClientsCount: 0, namespaces: [] as { name: string; socketsCount: number }[] }
    }

    const totalClients = list.reduce((acc, s) => acc + s.clientsCount, 0)
    const totalPolling = list.reduce((acc, s) => acc + s.pollingClientsCount, 0)

    const nspMap = new Map<string, number>()
    list.forEach((server) => {
      server.namespaces.forEach((ns) => {
        const current = nspMap.get(ns.name) || 0
        nspMap.set(ns.name, current + ns.socketsCount)
      })
    })

    return {
      clientsCount: totalClients,
      pollingClientsCount: totalPolling,
      namespaces: Array.from(nspMap.entries()).map(([name, socketsCount]) => ({ name, socketsCount })),
    }
  })

  // 工具方法
  const formatClient = (client: ClientDetail): ClientDetail => ({
    ...client,
    handshake: {
      ...client.handshake,
      time: dayjs(client.handshake.time).format("YYYY-MM-DD HH:mm:ss"),
    },
  })

  const { socket, isConnected, isConnecting, connect, disconnect: rawDisconnect } = useSocket()

  const handleConnect = (config: ConnectConfig) => {
    const ns = config.namespace.startsWith("/") ? config.namespace : `/${config.namespace}`
    const baseUrl = config.url.endsWith("/") ? config.url.slice(0, -1) : config.url

    const sio = connect({
      url: baseUrl,
      namespace: ns,
      path: config.path,
      auth: {
        username: config.username,
        password: config.password,
      },
    })
    if (!sio) return

    // 绑定业务监听
    sio.on("connect", () => message.success("Admin Session Started"))

    sio.on("all_sockets", (data: ClientDetail[]) => {
      clients.value = [...data.map(formatClient)]
      const historyMap = new Map()
      ;[...connectedHistory.value, ...data.map(formatClient)].forEach((item) => historyMap.set(item.id, item))
      connectedHistory.value = Array.from(historyMap.values()).reverse()
    })

    sio.on("server_stats", (data: ServerStats) => {
      allEvents.value.push(...data.aggregatedEvents)
      const limit = Date.now() - 10 * 60 * 1000
      allEvents.value = allEvents.value.filter((e) => e.timestamp > limit)
      serversMap.value.set(data.serverId, data)
    })

    sio.on("socket_connected", (client: ClientDetail, time: string) => {
      const formattedClient = formatClient(client)
      const clientIndex = clients.value.findIndex((c) => c.id === client.id)
      if (clientIndex > -1) clients.value.splice(clientIndex, 1, formattedClient)
      else clients.value.push(formattedClient)

      if (!connectedHistory.value.some((c) => c.id === client.id)) {
        connectedHistory.value.unshift(formattedClient)
        if (connectedHistory.value.length > 50) connectedHistory.value.pop()
      }

      events.value.unshift({ type: "CONN", event: "Connected", args: client.id, time, nsp: client.nsp, sid: client.id })
    })

    sio.on("socket_disconnected", (nsp: string, sid: string, reason: string, time: string) => {
      clients.value = clients.value.filter((c) => c.id !== sid)
      events.value.unshift({ type: "DISC", event: "Disconnected", args: reason, time, nsp, sid })
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sio.on("event_received", (nsp: string, sid: string, packet: any[], time: string) => {
      events.value.unshift({
        type: "R",
        event: packet[0],
        args: packet.slice(1),
        time: dayjs(time).format("HH:mm:ss"),
        nsp,
        sid,
      })
      if (events.value.length > 100) events.value.pop()
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sio.on("event_sent", (nsp: string, sid: string, packet: any[], time: string) => {
      events.value.unshift({
        type: "S",
        event: packet[0],
        args: packet.slice(1),
        time: dayjs(time).format("HH:mm:ss"),
        nsp,
        sid,
      })
      if (events.value.length > 100) events.value.pop()
    })

    sio.on("connect_error", (err) => {
      message.error(`Auth Failed: ${err.message}`)
      handleDisconnect()
    })
  }

  const handleDisconnect = () => {
    rawDisconnect()
    serversMap.value.clear()
    clients.value = []
    connectedHistory.value = []
    events.value = []
  }

  const kickClient = (sid: string) => {
    if (!socket.value?.connected) return
    socket.value.emit("_disconnect", "/", true, sid)
    message.info(`Disconnect command sent for: ${sid}`)
  }

  return {
    isConnected,
    isConnecting,
    aggregatedStats,
    serversList,
    clients,
    connectedHistory,
    events,
    allEvents,
    connect: handleConnect,
    disconnect: handleDisconnect,
    kickClient,
  }
}
