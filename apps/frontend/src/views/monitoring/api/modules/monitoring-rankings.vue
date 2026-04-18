<script setup lang="ts">
  import { watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"

  defineOptions({ name: "MonitoringRankings" })

  const props = defineProps<{
    topRequests: Api.Monitoring.ApiTopItem[]
    topP95: Api.Monitoring.ApiTopItem[]
  }>()

  // Horizontal bar - Top Requests
  const { domRef: reqBarRef, updateOptions: setReqBar } = useEcharts(() => ({
    tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
    grid: { left: 140, right: 24, top: 8, bottom: 8 },
    xAxis: { type: "value" as const, show: false },
    yAxis: {
      type: "category" as const,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, width: 130, overflow: "truncate" as const },
      data: [] as string[],
    },
    series: [
      {
        type: "bar" as const,
        barMaxWidth: 16,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        data: [] as number[],
      },
    ],
  }))

  // Horizontal bar - Top P95
  const { domRef: p95BarRef, updateOptions: setP95Bar } = useEcharts(() => ({
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      valueFormatter: (v: unknown) => `${v} ms`,
    },
    grid: { left: 140, right: 24, top: 8, bottom: 8 },
    xAxis: { type: "value" as const, show: false },
    yAxis: {
      type: "category" as const,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, width: 130, overflow: "truncate" as const },
      data: [] as string[],
    },
    series: [
      {
        type: "bar" as const,
        barMaxWidth: 16,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: "#f0a020" },
        data: [] as number[],
      },
    ],
  }))

  watch(
    () => props.topRequests,
    (data) => {
      setReqBar((opts) => {
        opts.yAxis.data = data.map((d) => `${d.method} ${d.path}`)
        opts.series[0].data = data.map((d) => d.requestCount)
        return opts
      })
    },
    { deep: true },
  )

  watch(
    () => props.topP95,
    (data) => {
      setP95Bar((opts) => {
        opts.yAxis.data = data.map((d) => `${d.method} ${d.path}`)
        opts.series[0].data = data.map((d) => d.p95Ms)
        return opts
      })
    },
    { deep: true },
  )
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-16px">
    <NCard :bordered="false" class="card-wrapper">
      <div class="text-14px font-600 mb-12px">{{ $t("page.monitoring.api.topRequests") }}</div>
      <div ref="reqBarRef" class="h-300px" />
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <div class="text-14px font-600 mb-12px">{{ $t("page.monitoring.api.topP95") }}</div>
      <div ref="p95BarRef" class="h-300px" />
    </NCard>
  </div>
</template>
