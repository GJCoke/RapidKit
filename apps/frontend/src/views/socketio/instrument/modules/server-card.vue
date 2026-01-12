<script setup lang="ts">
  import { $t } from "@/locales"
  import { ServerStats } from "./types"
  import { onMounted, onUnmounted, ref } from "vue"

  interface Props {
    isConnected: boolean
    servers: ServerStats[]
  }

  defineProps<Props>()
  const emit = defineEmits<{
    remove: [serverId: string]
  }>()

  // 10 秒没收到心跳/数据包判定为服务离线
  const OFFLINE_THRESHOLD = 10000

  const now = ref(Date.now())
  let timer: number

  onMounted(() => {
    timer = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })

  onUnmounted(() => {
    clearInterval(timer)
  })

  const isServerOnline = (lastUpdate?: number) => {
    if (!lastUpdate) return false
    return now.value - lastUpdate < OFFLINE_THRESHOLD
  }

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
      <div class="font-bold text-warning items-baseline flex gap-1">
        <n-number-animation :from="0" :to="servers.filter((s) => isServerOnline(s.lastUpdate)).length" />
        <span class="text-[10px] font-normal text-zinc-400">{{ $t("page.socketio.instrument.online") }}</span>
      </div>
    </template>
    <n-scrollbar v-if="isConnected && servers.length > 0" class="max-h-[140px]">
      <div class="flex flex-col gap-3">
        <div
          v-for="server in servers"
          :key="server.serverId"
          class="relative overflow-hidden rounded-xl border border-zinc-100 dark:border-zinc-800 transition-all group"
        >
          <!-- 悬浮删除按钮层：直接覆盖在右侧 -->
          <div
            v-if="!isServerOnline(server.lastUpdate)"
            class="absolute inset-y-0 right-0 w-12 bg-error flex items-center justify-center cursor-pointer transition-opacity opacity-0 group-hover:opacity-100 z-10"
            @click.stop="emit('remove', server.serverId)"
          >
            <icon-material-symbols-delete-outline class="text-white text-lg" />
          </div>

          <!-- 内容区域：保持原位，不进行位移 -->
          <div
            :class="[
              'p-3 bg-zinc-50/50 dark:bg-zinc-900/30',
              !isServerOnline(server.lastUpdate) ? 'border-l-4 border-l-error bg-error/5' : '',
            ]"
          >
            <div class="flex justify-between items-center mb-1">
              <span
                :class="[
                  'text-[10px] font-mono font-bold truncate',
                  isServerOnline(server.lastUpdate) ? 'text-primary' : 'text-error',
                ]"
              >
                Host: {{ server.hostname }}
              </span>
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono text-zinc-400">PID: {{ server.pid }}</span>
              </div>
            </div>

            <div class="text-[11px]">
              <div class="flex justify-between items-center">
                <span class="text-zinc-400">{{ $t("page.socketio.instrument.uptime") }}</span>
                <span
                  :class="['font-mono font-bold', isServerOnline(server.lastUpdate) ? 'text-success' : 'text-zinc-500']"
                >
                  {{ formatUptime(server.uptime) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </n-scrollbar>
    <n-empty v-else size="small" :description="isConnected ? 'No servers reported' : 'Offline'" class="py-4" />
  </n-card>
</template>
