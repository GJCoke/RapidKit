<script setup lang="ts">
  import { ref, computed, watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import ClientCard from "./client-card.vue"
  import type { ClientDetail } from "./types"
  import { $t } from "@/locales"

  interface Props {
    total: number
    polling: number
    connectedClients: ClientDetail[] // 传入实时连接的列表
  }

  const props = defineProps<Props>()
  const emit = defineEmits(["kick"])

  const webSocket = computed(() => Math.max(0, props.total - props.polling))
  const showDrawer = ref(false)

  const handleKick = (sid: string) => {
    window.$dialog?.error({
      title: $t("page.socketio.instrument.terminateConnection"),
      content: $t("page.socketio.instrument.terminateContent", { sid }),
      positiveText: $t("page.socketio.common.disconnect"),
      negativeText: $t("common.cancel"),
      onPositiveClick: () => {
        emit("kick", sid)
      },
    })
  }

  const { domRef, updateOptions } = useEcharts(() => ({
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: {
      bottom: "0%",
      left: "center",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 10 },
    },
    series: [
      {
        name: "Transports",
        type: "pie",
        radius: ["45%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: "transparent", borderWidth: 2 },
        label: { show: false },
        data: [] as { value: number; name: string; itemStyle: { color: string } }[],
      },
    ],
  }))

  watch(
    [() => props.polling, webSocket],
    () => {
      updateOptions((opts) => {
        opts.series[0].data = [
          { value: props.polling, name: "Polling", itemStyle: { color: "#f0a020" } },
          { value: webSocket.value, name: "WebSocket", itemStyle: { color: "#18a058" } },
        ]
        return opts
      })
    },
    { immediate: true },
  )
</script>

<template>
  <n-card :title="$t('page.socketio.instrument.clientDistribution')" size="small" class="shadow-sm border-none h-full">
    <template #header-extra>
      <n-button size="tiny" quaternary circle @click="showDrawer = true">
        <template #icon><icon-mdi-account-group-outline /></template>
      </n-button>
    </template>

    <div class="flex h-full items-center">
      <!-- 左侧：图表 -->
      <div ref="domRef" class="w-1/2 h-36"></div>

      <!-- 右侧：数字统计 -->
      <div class="w-1/2 flex flex-col justify-center gap-3 pl-4 border-l border-zinc-100 dark:border-zinc-800">
        <div class="cursor-pointer hover:opacity-80 transition-opacity" @click="showDrawer = true">
          <div class="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">
            {{ $t("page.socketio.instrument.totalClients") }}
          </div>
          <div class="text-2xl font-bold font-mono text-primary flex items-baseline gap-1">
            <n-number-animation :from="0" :to="total" />
            <span class="text-[10px] font-normal text-zinc-400">{{ $t("page.socketio.instrument.online") }}</span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="flex items-center gap-1.5 text-zinc-500">
              <span class="w-2 h-2 rounded-full bg-[#18a058]"></span>
              WebSocket
            </span>
            <span class="font-mono font-bold">{{ webSocket }}</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="flex items-center gap-1.5 text-zinc-500">
              <span class="w-2 h-2 rounded-full bg-[#f0a020]"></span>
              Polling
            </span>
            <span class="font-mono font-bold">{{ polling }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 侧边栏：已连接用户详细快照 -->
    <n-drawer v-model:show="showDrawer" :width="420" placement="right">
      <n-drawer-content :title="$t('page.socketio.instrument.connectedHistory')" closable>
        <div class="space-y-4">
          <ClientCard v-for="c in connectedClients" :key="c.id" :client="c" show-action @kick="handleKick" />
          <n-empty
            v-if="connectedClients.length === 0"
            :description="$t('page.socketio.instrument.eventsEmpty')"
            class="mt-20"
          />
        </div>
      </n-drawer-content>
    </n-drawer>
  </n-card>
</template>
