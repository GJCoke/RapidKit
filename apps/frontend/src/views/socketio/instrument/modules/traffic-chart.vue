<script setup lang="ts">
  import { ref, watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import dayjs from "dayjs"
  import type { AggregatedEvent } from "./types"
  import { $t } from "@/locales"
  import { useI18n } from "vue-i18n"

  interface Props {
    events: AggregatedEvent[]
  }

  const props = defineProps<Props>()
  const { locale } = useI18n()

  // 内部存储用于显示的数据
  const chartData = ref<{
    time: string[]
    received: number[]
    sent: number[]
  }>({ time: [], received: [], sent: [] })

  const { domRef, setOptions, updateOptions } = useEcharts(() => ({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        let res = params[0].name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params.forEach((p: any) => {
          const val = p.value >= 1024 ? (p.value / 1024).toFixed(2) + " KB" : p.value + " B"
          res += `<br/>${p.marker}${p.seriesName}: <b>${val}</b>`
        })
        return res
      },
    },
    legend: { data: [$t("page.socketio.instrument.received"), $t("page.socketio.instrument.sent")], bottom: 0 },
    grid: { left: "3%", right: "4%", top: "10%", bottom: "15%" },
    xAxis: { type: "category", data: [], axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", name: "Bytes" },
    series: [
      { name: $t("page.socketio.instrument.received"), type: "bar", data: [], itemStyle: { color: "#18a058" } },
      { name: $t("page.socketio.instrument.sent"), type: "bar", data: [], itemStyle: { color: "#2080f0" } },
    ],
  }))

  watch(locale, () => {
    updateOptions((opts) => {
      opts.legend = {
        ...opts.legend,
        data: [$t("page.socketio.instrument.received"), $t("page.socketio.instrument.sent")],
      }
      opts.series[0].name = $t("page.socketio.instrument.received")
      opts.series[1].name = $t("page.socketio.instrument.sent")
      return opts
    })
  })

  // 处理传入的事件并转换成图表数据
  watch(
    () => props.events,
    (newEvents) => {
      if (!newEvents || newEvents.length === 0) return

      const tenMinutesAgo = Date.now() - 10 * 60 * 1000

      // 按时间戳分组聚合
      const groups = new Map<number, { in: number; out: number }>()

      newEvents.forEach((ev) => {
        if (ev.timestamp < tenMinutesAgo) return
        if (ev.type !== "bytesIn" && ev.type !== "bytesOut") return

        const roundedTimestamp = Math.floor(ev.timestamp / 10000) * 10000

        const current = groups.get(roundedTimestamp) || { in: 0, out: 0 }
        if (ev.type === "bytesIn") current.in += ev.count
        if (ev.type === "bytesOut") current.out += ev.count
        groups.set(roundedTimestamp, current)
      })

      // 排序并转换成图表格式
      const sortedTimestamps = Array.from(groups.keys()).sort((a, b) => a - b)

      chartData.value = {
        time: sortedTimestamps.map((t) => dayjs(t).format("HH:mm:ss")),
        received: sortedTimestamps.map((t) => groups.get(t)!.in),
        sent: sortedTimestamps.map((t) => groups.get(t)!.out),
      }

      setOptions({
        xAxis: {
          data: chartData.value.time,
        },
        series: [
          {
            data: chartData.value.received,
          },
          {
            data: chartData.value.sent,
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    },
    { deep: true },
  )
</script>

<template>
  <n-card :title="$t('page.socketio.instrument.networkTraffic')" size="small" class="shadow-sm border-none">
    <div ref="domRef" class="w-full h-full"></div>
  </n-card>
</template>
