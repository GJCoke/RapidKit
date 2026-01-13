<script setup lang="ts">
  import type { ClientDetail } from "./types"
  import { ref } from "vue"
  import { $t } from "@/locales"
  import ClientDetailModal from "./client-detail-modal.vue"

  interface Props {
    client: ClientDetail
    showAction?: boolean
  }

  defineProps<Props>()
  const emit = defineEmits(["kick"])

  const showDetail = ref(false)
</script>

<template>
  <div>
    <ClientDetailModal v-model:show="showDetail" :client="client" />

    <n-card
      size="small"
      embedded
      class="relative overflow-hidden group hover:shadow-md transition-all cursor-pointer"
      :style="{ borderLeftColor: client.transport === 'websocket' ? '#18a058' : '#f0a020', borderLeftWidth: '4px' }"
      @click="showDetail = true"
    >
      <div class="flex flex-col gap-3">
        <!-- 第一行：ID 与 操作 -->
        <div class="flex justify-between items-center">
          <div class="flex flex-col min-w-0">
            <span class="text-[10px] text-zinc-400 font-mono tracking-tighter uppercase leading-none mb-1"
              >Socket ID</span
            >
            <span class="text-xs font-bold text-primary font-mono truncate">{{ client.id }}</span>
          </div>
          <div class="flex gap-2 items-center shrink-0">
            <n-tag size="small" :type="client.transport === 'websocket' ? 'success' : 'warning'" round>
              {{ client.transport.toUpperCase() }}
            </n-tag>
            <n-button
              v-if="showAction"
              circle
              size="tiny"
              type="error"
              quaternary
              @click.stop="emit('kick', client.id)"
            >
              <template #icon><icon-mdi-link-off /></template>
            </n-button>
          </div>
        </div>

        <!-- 第二行：核心元数据 -->
        <div class="grid grid-cols-2 gap-4 bg-zinc-100/50 dark:bg-zinc-800/50 p-2 rounded-md">
          <div class="flex flex-col">
            <span class="text-[9px] text-zinc-400 uppercase">{{ $t("page.socketio.common.namespace") }}</span>
            <span class="text-[11px] font-medium truncate">{{ client.nsp }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-[9px] text-zinc-400 uppercase">{{ $t("page.socketio.instrument.ipAddress") }}</span>
            <span class="text-[11px] font-medium tabular-nums truncate">{{ client.handshake.address }}</span>
          </div>
        </div>

        <!-- 第三行：房间与时间 -->
        <div class="space-y-2">
          <div v-if="client.rooms.length > 0" class="flex flex-wrap gap-1">
            <n-tag
              v-for="r in client.rooms.slice(0, 5)"
              :key="r"
              size="small"
              :type="r === client.id ? 'default' : 'info'"
              quaternary
              round
            >
              {{ r }}
            </n-tag>
            <span v-if="client.rooms.length > 5" class="text-[10px] text-zinc-400 self-center">
              +{{ client.rooms.length - 5 }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <icon-mdi-clock-outline class="text-xs" />
            <span class="tabular-nums">{{ client.handshake.time }}</span>
          </div>
        </div>
      </div>
    </n-card>
  </div>
</template>
