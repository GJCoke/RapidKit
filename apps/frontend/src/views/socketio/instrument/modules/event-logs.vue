<script setup lang="ts">
  import { computed } from "vue"
  import type { EventLog } from "./types"
  import { sentOrReceivedRecord } from "@/constants/common"
  import SocketLogCard from "@/components/custom/socket-log-card.vue"

  interface EventTypeLog extends EventLog {
    type: "R" | "S"
  }

  interface Props {
    events: EventLog[]
  }

  const props = defineProps<Props>()

  const label = sentOrReceivedRecord

  // 过滤出真正的数据消息事件 (接收和发送)
  const messageEvents = computed<EventTypeLog[]>(() => {
    return props.events.filter((e): e is EventTypeLog => e.type === "R" || e.type === "S")
  })
</script>

<template>
  <n-card :title="$t('page.socketio.instrument.eventMessages')" size="small" class="shadow-sm border-none flex-1">
    <template #header-extra>
      <n-tag :bordered="false" size="small" round type="info"> {{ messageEvents.length }} Events </n-tag>
    </template>

    <n-scrollbar class="h-[604px]">
      <div v-if="messageEvents.length > 0" class="flex flex-col gap-3 pr-3">
        <div v-for="(ev, idx) in messageEvents" :key="idx">
          <socket-log-card
            :sid="ev.sid"
            :namespace="ev.nsp"
            :time="ev.time"
            :event="ev.event"
            :tag-type="ev.type === 'R' ? 'success' : 'warning'"
            :type="$t(label[ev.type])"
            :data="ev.args"
          />
        </div>
      </div>
      <n-empty v-else :description="$t('page.socketio.instrument.noCaptured')" class="py-10" />
    </n-scrollbar>
  </n-card>
</template>
