<script setup lang="ts">
  import type { tagProps } from "naive-ui"
  import type { ExtractPropTypes } from "vue"
  import LabelTag from "@/components/common/label-tag.vue"

  interface Props {
    sid?: string
    namespace: string
    time: string
    event?: string
    tagType?: ExtractPropTypes<typeof tagProps>["type"]
    type: string
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any
  }

  defineOptions({ name: "SocketIoDebug" })
  defineProps<Props>()

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  const formatArgs = (args: any) => {
    try {
      if (typeof args === "string") return args
      return JSON.stringify(args, null, 2)
    } catch (e) {
      return String(args)
    }
  }
</script>

<template>
  <div
    class="group p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:shadow-sm transition-all"
  >
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <LabelTag :type="tagType" :text="type" />
        <span class="text-zinc-400 tabular-nums text-[10px]">[{{ time }}]</span>
      </div>
      <span class="text-[12px] text-primary font-bold">
        {{ event }}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-2 text-[10px] text-zinc-400">
      <div v-if="sid" class="truncate"><span>SID:</span> {{ sid }}</div>
      <div v-if="namespace" class="text-right">{{ namespace }}</div>
    </div>

    <div v-if="data" class="bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-100 dark:border-zinc-800">
      <div class="text-[11px] font-mono whitespace-pre-wrap break-all text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {{ formatArgs(data) }}
      </div>
    </div>
  </div>
</template>

<style scoped></style>
