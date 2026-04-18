<script setup lang="ts">
  import { watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"

  defineOptions({ name: "MonitoringCharts" })

  const props = defineProps<{
    distribution: Api.Monitoring.ApiDistributionItem[]
    trend: Api.Monitoring.ApiTrendPoint[]
  }>()

  // Pie chart - Distribution
  const { domRef: pieRef, updateOptions: setPieChart } = useEcharts(() => ({
    tooltip: { trigger: "item" as const, formatter: "{b}: {c} ({d}%)" },
    legend: { type: "scroll" as const, bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
    series: [
      {
        type: "pie" as const,
        radius: ["35%", "65%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: "bold" } },
        data: [] as { name: string; value: number }[],
      },
    ],
  }))

  // Line chart - Trend
  const { domRef: trendRef, updateOptions: setTrendChart } = useEcharts(() => ({
    tooltip: { trigger: "axis" as const },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
    grid: { left: 48, right: 48, top: 16, bottom: 40 },
    xAxis: { type: "category" as const, data: [] as string[], axisLine: { show: false }, axisTick: { show: false } },
    yAxis: [
      {
        type: "value" as const,
        name: $t("page.monitoring.api.requestCount"),
        splitLine: { lineStyle: { type: "dashed" as const, opacity: 0.3 } },
      },
      {
        type: "value" as const,
        name: $t("page.monitoring.api.errorCount"),
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: $t("page.monitoring.api.requestCount"),
        type: "bar" as const,
        yAxisIndex: 0,
        barMaxWidth: 20,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: [] as number[],
      },
      {
        name: $t("page.monitoring.api.errorCount"),
        type: "line" as const,
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: "#d03050" },
        itemStyle: { color: "#d03050" },
        data: [] as number[],
      },
    ],
  }))

  watch(
    () => props.distribution,
    (data) => {
      setPieChart((opts) => {
        opts.series[0].data = data.map((d) => ({ name: `${d.method} ${d.path}`, value: d.requestCount }))
        return opts
      })
    },
    { deep: true },
  )

  watch(
    () => props.trend,
    (data) => {
      setTrendChart((opts) => {
        opts.xAxis.data = data.map((d) => d.timeBucket)
        opts.series[0].data = data.map((d) => d.requestCount)
        opts.series[1].data = data.map((d) => d.errorCount)
        return opts
      })
    },
    { deep: true },
  )
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-16px">
    <NCard :bordered="false" class="card-wrapper">
      <div class="text-14px font-600 mb-12px">{{ $t("page.monitoring.api.distribution") }}</div>
      <div ref="pieRef" class="h-300px" />
    </NCard>
    <NCard :bordered="false" class="card-wrapper">
      <div class="text-14px font-600 mb-12px">{{ $t("page.monitoring.api.trend") }}</div>
      <div ref="trendRef" class="h-300px" />
    </NCard>
  </div>
</template>
