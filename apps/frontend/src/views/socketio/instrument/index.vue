<script setup lang="ts">
  import { computed } from "vue"
  import ConnectPanel from "./modules/connect-panel.vue"
  import ClientOverview from "./modules/client-overview.vue"
  import NamespaceCard from "./modules/namespace-card.vue"
  import TrafficChart from "./modules/traffic-chart.vue"
  import ConnectionChart from "./modules/connection-chart.vue"
  import EventLogs from "./modules/event-logs.vue"
  import ServerCard from "./modules/server-card.vue"
  import { useInstrumentSocket } from "./modules/hooks"

  defineOptions({ name: "SocketIoInstrument" })

  const {
    isConnected,
    isConnecting,
    aggregatedStats,
    serversList,
    clients,
    connectedHistory,
    events,
    allEvents,
    connect,
    disconnect,
    kickClient,
  } = useInstrumentSocket()

  const hasMessages = computed(() => events.value.some((e) => e.type === "R" || e.type === "S"))
</script>

<template>
  <div class="h-full flex flex-col p-4 bg-zinc-50 dark:bg-zinc-950 font-sans">
    <n-scrollbar>
      <div class="flex flex-col gap-4 pr-4">
        <ConnectPanel
          :is-connected="isConnected"
          :is-connecting="isConnecting"
          @connect="connect"
          @disconnect="disconnect"
        />

        <div :class="['grid gap-4 transition-all duration-500', hasMessages ? 'grid-cols-2' : 'grid-cols-1']">
          <div :class="['gap-4 transition-all', hasMessages ? 'col-span-1 flex flex-col' : 'grid grid-cols-3']">
            <ClientOverview
              :total="aggregatedStats.clientsCount"
              :polling="aggregatedStats.pollingClientsCount"
              :connected-clients="connectedHistory"
              @kick="kickClient"
            />
            <NamespaceCard :namespaces="aggregatedStats.namespaces" :all-clients="clients" />
            <ServerCard :is-connected="isConnected" :servers="serversList" />
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
