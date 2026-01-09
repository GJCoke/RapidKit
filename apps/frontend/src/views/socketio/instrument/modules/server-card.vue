<script setup lang="ts">
  import { $t } from "@/locales"
  import { ServerStats } from "./types"

  interface Props {
    isConnected: boolean
    servers: ServerStats[]
  }

  const props = defineProps<Props>()

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return $t("page.socketio.instrument.formatUptime", { h, m, s })
  }
</script>

<template>
  <n-card
    :title="$t('page.socketio.instrument.serverInfo')"
    size="small"
    class="shadow-sm border-none h-full"
    content-style="padding: 12px;"
  >
    <template #header-extra>
      <div class="font-bold text-primary items-baseline flex gap-1">
        <n-number-animation :from="0" :to="servers.length" />
        <span class="text-[10px] font-normal text-zinc-400">{{ $t("page.socketio.instrument.online") }}</span>
      </div>
    </template>
    <n-scrollbar v-if="isConnected && props.servers.length > 0" class="max-h-[140px]">
      <div class="flex flex-col gap-3">
        <div
          v-for="server in props.servers"
          :key="server.serverId"
          class="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30"
        >
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] font-mono text-primary font-bold truncate"> Host: {{ server.hostname }} </span>
            <span class="text-[10px] font-mono text-primary font-bold truncate"> PID: {{ server.pid }} </span>
          </div>

          <div class="text-[11px]">
            <div class="flex justify-between items-center">
              <span class="text-zinc-400">{{ $t("page.socketio.instrument.uptime") }}</span>
              <span class="font-mono text-success font-bold">{{ formatUptime(server.uptime) }}</span>
            </div>
          </div>
        </div>
      </div>
    </n-scrollbar>
    <n-empty v-else size="small" :description="isConnected ? 'No servers reported' : 'Offline'" class="py-4" />
  </n-card>
</template>
