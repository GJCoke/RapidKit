<script setup lang="ts">
  import { watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import dayjs from "dayjs"
  import type { EventLog } from "./types"
  import { $t } from "@/locales"
  import { useI18n } from "vue-i18n"

  interface Props {
    events: EventLog[]
  }

  const props = defineProps<Props>()

  const { locale } = useI18n()

  const { domRef, setOptions, updateOptions } = useEcharts(() => ({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    legend: { data: [$t("page.socketio.common.connect"), $t("page.socketio.common.disconnect")], bottom: 0 },
    grid: { left: "3%", right: "4%", top: "10%", bottom: "15%" },
    xAxis: { type: "category", data: [], axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", name: "Number", minInterval: 1 },
    series: [
      {
        name: $t("page.socketio.common.connect"),
        type: "bar",
        data: [],
        itemStyle: { color: "#18a058" },
      },
      {
        name: $t("page.socketio.common.disconnect"),
        type: "bar",
        data: [],
        itemStyle: { color: "#d03050" }, // Error/Red color
      },
    ],
  }))

  watch(locale, () => {
    updateOptions((opts) => {
      opts.legend = {
        ...opts.legend,
        data: [$t("page.socketio.common.connect"), $t("page.socketio.common.disconnect")],
      }
      opts.series[0].name = $t("page.socketio.common.connect")
      opts.series[1].name = $t("page.socketio.common.disconnect")
      return opts
    })
  })

  watch(
    () => props.events,
    (newEvents) => {
      if (!newEvents) return

      const tenMinutesAgo = Date.now() - 10 * 60 * 1000
      const groups = new Map<number, { conn: number; disc: number }>()

      newEvents.forEach((ev) => {
        if (ev.type !== "CONN" && ev.type !== "DISC") return

        const timestamp = dayjs(ev.time).valueOf()
        if (timestamp < tenMinutesAgo) return

        const rounded = Math.floor(timestamp / 10000) * 10000
        const current = groups.get(rounded) || { conn: 0, disc: 0 }

        if (ev.type === "CONN") current.conn++
        if (ev.type === "DISC") current.disc++

        groups.set(rounded, current)
      })

      const sortedTs = Array.from(groups.keys()).sort((a, b) => a - b)

      setOptions({
        xAxis: {
          data: sortedTs.map((t) => dayjs(t).format("HH:mm:ss")),
        },
        series: [
          { data: sortedTs.map((t) => groups.get(t)!.conn) },
          { data: sortedTs.map((t) => groups.get(t)!.disc) },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    },
    { deep: true },
  )
</script>

<template>
  <n-card size="small" :title="$t('page.socketio.instrument.connectionStatistics')" class="shadow-sm border-none">
    <div ref="domRef" class="w-full h-full"></div>
  </n-card>
</template>
