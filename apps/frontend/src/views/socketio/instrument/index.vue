<script setup lang="ts">
  import { computed, reactive, ref } from "vue"
  import ClientOverview from "./modules/client-overview.vue"
  import NamespaceCard from "./modules/namespace-card.vue"
  import TrafficChart from "./modules/traffic-chart.vue"
  import ConnectionChart from "./modules/connection-chart.vue"
  import EventLogs from "./modules/event-logs.vue"
  import ServerCard from "./modules/server-card.vue"
  import { useMessage } from "naive-ui"
  import type { AggregatedEvent, ClientDetail, EventLog, ServerStats } from "./modules/types"
  import dayjs from "dayjs"
  import { useSocket } from "@/hooks/common/socket"
  import { $t } from "@/locales"

  defineOptions({ name: "SocketIoInstrument" })

  const message = useMessage()

  // 基础状态
  const serversMap = ref<Map<string, ServerStats>>(new Map())
  const clients = ref<ClientDetail[]>([])
  const connectedHistory = ref<ClientDetail[]>([])
  const allEvents = ref<AggregatedEvent[]>([])
  const events = ref<EventLog[]>([])

  const url = new URL(import.meta.env.VITE_SERVICE_BASE_URL)
  const config = reactive({
    url: url.origin || window.location.origin,
    path: "/socket.io",
    namespace: "/admin",
    username: "admin",
    password: "123456",
  })

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

  const handleConnect = () => {
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
      onConnect: () => message.success($t("page.socketio.instrument.adminSessionStarted")),
      onError: (err) => {
        message.error($t("page.socketio.instrument.authFailed", { message: err.message }))
        handleDisconnect()
      },
    })
    if (!sio) return

    // 绑定业务监听
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
      serversMap.value.set(data.serverId, { ...data, lastUpdate: Date.now() })
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
      connectedHistory.value = connectedHistory.value.filter((client) => client.id !== sid)
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
  }

  const handleDisconnect = () => {
    rawDisconnect()
    serversMap.value.clear()
    clients.value = []
    connectedHistory.value = []
    events.value = []
  }

  const removeServer = (serverId: string) => {
    serversMap.value.delete(serverId)
    message.info($t("page.socketio.instrument.serverRemoved", { serverId }))
  }

  const kickClient = (sid: string) => {
    if (!socket.value?.connected) return
    socket.value.emit("_disconnect", "/", true, sid)
    message.info($t("page.socketio.instrument.disconnectCommandSent", { sid }))
  }

  const hasMessages = computed(() => events.value.some((e) => e.type === "R" || e.type === "S"))
</script>

<template>
  <div class="h-full flex flex-col p-4 bg-zinc-50 dark:bg-zinc-950 font-sans">
    <n-scrollbar>
      <div class="flex flex-col gap-4 pr-4">
        <socket-connect-card
          v-model:url="config.url"
          v-model:path="config.path"
          v-model:namespace="config.namespace"
          :is-connected="isConnected"
          :is-connecting="isConnecting"
          :tip-text="$t('page.socketio.instrument.tip')"
          @connect="handleConnect"
          @disconnect="handleDisconnect"
        >
          <template #auth>
            <n-grid :cols="24" :x-gap="12">
              <n-gi :span="12">
                <n-input-group>
                  <n-input-group-label>{{ $t("page.socketio.instrument.username") }}</n-input-group-label>
                  <n-input
                    v-model:value="config.username"
                    :placeholder="$t('page.socketio.instrument.usernamePlaceholder')"
                  />
                </n-input-group>
              </n-gi>
              <n-gi :span="12">
                <n-input-group>
                  <n-input-group-label>{{ $t("page.socketio.instrument.password") }}</n-input-group-label>
                  <n-input
                    v-model:value="config.password"
                    type="password"
                    :placeholder="$t('page.socketio.instrument.passwordPlaceholder')"
                  />
                </n-input-group>
              </n-gi>
            </n-grid>
          </template>
        </socket-connect-card>

        <div :class="['grid gap-4 transition-all duration-500', hasMessages ? 'grid-cols-2' : 'grid-cols-1']">
          <div :class="['gap-4 transition-all', hasMessages ? 'col-span-1 flex flex-col' : 'grid grid-cols-3']">
            <ClientOverview
              :total="aggregatedStats.clientsCount"
              :polling="aggregatedStats.pollingClientsCount"
              :connected-clients="connectedHistory"
              @kick="kickClient"
            />
            <NamespaceCard :namespaces="aggregatedStats.namespaces" :all-clients="clients" />
            <ServerCard :is-connected="isConnected" :servers="serversList" @remove="removeServer" />
          </div>

          <div v-if="hasMessages" class="col-span-1">
            <EventLogs :events="events" />
          </div>
        </div>

        <div class="min-h-[340px] grid grid-cols-2 gap-4">
          <ConnectionChart :events="events" />
          <TrafficChart :events="allEvents" />
        </div>
      </div>
    </n-scrollbar>
  </div>
</template>
