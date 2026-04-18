<script setup lang="ts">
  import { computed, watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardTrendCharts" })

  const props = defineProps<{
    userTrend: Api.Dashboard.UserActivityTrend[]
    trendRange: "today" | "7d" | "30d" | "custom"
    loading: boolean
  }>()

  const emit = defineEmits<{
    rangeChange: [range: "today" | "7d" | "30d" | "custom", custom?: [number, number]]
  }>()

  // User trend chart
  const { domRef: userChartRef, updateOptions: setUserChart } = useEcharts(() => ({
    tooltip: { trigger: "axis" as const },
    grid: { left: 48, right: 16, top: 24, bottom: 28 },
    xAxis: { type: "category" as const, data: [] as string[], axisLine: { show: false }, axisTick: { show: false } },
    yAxis: {
      type: "value" as const,
      minInterval: 1,
      splitLine: { lineStyle: { type: "dashed" as const, opacity: 0.3 } },
    },
    series: [
      {
        name: $t("page.home.dashboard.newUsers"),
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        areaStyle: { opacity: 0.15 },
        data: [] as number[],
      },
    ],
  }))

  watch(
    () => props.userTrend,
    (data) => {
      setUserChart((opts) => {
        opts.xAxis.data = data.map((d) => d.timeBucket)
        opts.series[0].data = data.map((d) => d.newUsers)
        return opts
      })
    },
    { deep: true },
  )

  const rangeButtons = computed(() => [
    { key: "today" as const, label: $t("page.home.dashboard.today") },
    { key: "7d" as const, label: $t("page.home.dashboard.last7Days") },
    { key: "30d" as const, label: $t("page.home.dashboard.last30Days") },
  ])

  function handleRangeClick(range: "today" | "7d" | "30d") {
    emit("rangeChange", range)
  }

  function handleCustomRange(value: [number, number] | null) {
    if (value) {
      emit("rangeChange", "custom", value)
    }
  }
</script>

<template>
  <NCard :bordered="false" class="card-wrapper">
    <div class="flex items-center justify-between mb-16px flex-wrap gap-12px">
      <div class="flex items-center gap-8px text-15px font-600">
        <SvgIcon icon="carbon:chart-line" class="text-16px text-primary" />
        {{ $t("page.home.dashboard.trendCharts") }}
      </div>
      <div class="flex items-center gap-10px">
        <NButtonGroup size="small">
          <NButton
            v-for="btn in rangeButtons"
            :key="btn.key"
            :type="trendRange === btn.key ? 'primary' : 'default'"
            :tertiary="trendRange !== btn.key"
            @click="handleRangeClick(btn.key)"
          >
            {{ btn.label }}
          </NButton>
        </NButtonGroup>
        <NDatePicker type="daterange" size="small" clearable @update:value="handleCustomRange" />
      </div>
    </div>

    <NSpin :show="loading">
      <div class="text-13px text-[var(--text-color-3)] mb-4px pl-4px">{{ $t("page.home.dashboard.userTrend") }}</div>
      <div ref="userChartRef" class="h-260px" />
    </NSpin>
  </NCard>
</template>
