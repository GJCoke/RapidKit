<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"

  defineOptions({ name: "OperationsOverview" })

  const props = defineProps<{
    data: Api.Dashboard.OperationsOverview | null
    range: "7d" | "30d" | "custom"
    loading: boolean
    error: boolean
  }>()

  const emit = defineEmits<{
    rangeChange: [range: "7d" | "30d" | "custom", custom?: [number, number]]
    retry: []
  }>()

  const chartMetric = ref<"requests" | "latency">("requests")
  const rangeOptions = computed(() => [
    { label: $t("page.home.dashboard.last7Days"), value: "7d" },
    { label: $t("page.home.dashboard.last30Days"), value: "30d" },
  ])

  const { domRef: chartRef, updateOptions } = useEcharts(() => ({
    tooltip: { trigger: "axis" as const, valueFormatter: (value: unknown) => String(value ?? "—") },
    grid: { left: 48, right: 18, top: 24, bottom: 30 },
    xAxis: {
      type: "category" as const,
      boundaryGap: false,
      data: [] as string[],
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      minInterval: 1,
      axisLabel: { formatter: "{value}" },
      splitLine: { lineStyle: { type: "dashed" as const, opacity: 0.3 } },
    },
    series: [
      {
        name: $t("page.home.dashboard.requestCount"),
        type: "line" as const,
        smooth: true,
        showSymbol: true,
        symbolSize: 7,
        lineStyle: { width: 2.5 },
        areaStyle: { opacity: 0.1 },
        data: [] as Array<number | null>,
      },
    ],
  }))

  function updateChart() {
    const trend = props.data?.trend ?? []
    const latency = chartMetric.value === "latency"
    updateOptions((options) => {
      options.xAxis.data = trend.map((point) => point.date.slice(5))
      options.yAxis.minInterval = latency ? 0 : 1
      options.yAxis.axisLabel = { formatter: latency ? "{value} ms" : "{value}" }
      options.series[0].name = latency
        ? $t("page.home.dashboard.averageResponseTime")
        : $t("page.home.dashboard.requestCount")
      options.series[0].data = trend.map((point) => (latency ? point.avgResponseMs : point.requestCount))
      options.tooltip.valueFormatter = (value: unknown) =>
        value == null ? "—" : `${value}${latency ? " ms" : ` ${$t("page.home.dashboard.times")}`}`
      return options
    })
  }

  watch([() => props.data, chartMetric], updateChart, { deep: true, immediate: true })

  function formatNumber(value: number | null | undefined) {
    return value == null ? "—" : new Intl.NumberFormat().format(value)
  }

  function formatPercent(value: number | null | undefined) {
    return value == null ? "—" : `${value.toFixed(2)}%`
  }

  function changeText(value: number | null | undefined, unit = "%") {
    if (value == null) return "—"
    const sign = value > 0 ? "+" : ""
    return `${sign}${value.toFixed(2)}${unit}`
  }

  function changeClass(value: number | null | undefined, inverted = false) {
    if (value == null || value === 0) return "text-base-text-3"
    const positive = inverted ? value < 0 : value > 0
    return positive ? "text-success" : "text-error"
  }

  function formatDuration(seconds: number | undefined) {
    if (seconds == null) return "—"
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${days}${$t("page.home.dashboard.days")} ${hours}${$t("page.home.dashboard.hours")} ${minutes}${$t("page.home.dashboard.minutes")}`
  }

  function formatSyncTime(value: string | null | undefined) {
    if (!value) return "—"
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
      new Date(value),
    )
  }

  function handleRange(value: "7d" | "30d") {
    emit("rangeChange", value)
  }

  function handleCustomRange(value: [number, number] | null) {
    if (value) emit("rangeChange", "custom", value)
  }
</script>

<template>
  <NCard :bordered="false" class="card-wrapper operations-card" content-style="padding: 0">
    <div class="flex flex-wrap items-center justify-between gap-12px px-20px pb-12px pt-18px">
      <div>
        <h2 class="m-0 text-18px font-700">{{ $t("page.home.dashboard.operationsOverview") }}</h2>
        <p class="m-0 mt-3px text-12px text-base-text-3">
          {{ data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : $t("page.home.dashboard.noData") }}
        </p>
      </div>
      <div class="flex items-center gap-8px">
        <NSelect
          class="w-112px"
          size="small"
          :value="range === 'custom' ? null : range"
          :options="rangeOptions"
          @update:value="handleRange"
        />
        <NDatePicker type="daterange" size="small" clearable @update:value="handleCustomRange" />
      </div>
    </div>

    <NSpin :show="loading">
      <div v-if="error && !data" class="min-h-360px flex-col-center gap-12px">
        <NEmpty :description="$t('page.home.dashboard.overviewUnavailable')" />
        <NButton size="small" type="primary" @click="emit('retry')">
          {{ $t("page.home.dashboard.retry") }}
        </NButton>
      </div>

      <template v-else>
        <div class="metric-grid grid grid-cols-1 border-y border-theme-default sm:grid-cols-2 xl:grid-cols-4">
          <div class="metric-cell px-20px py-18px">
            <div class="flex items-center gap-8px text-13px text-base-text-2">
              {{ $t("page.home.dashboard.serverStatus") }}
              <span
                class="size-7px rd-full"
                :class="data?.summary.servers?.status === 'healthy' ? 'bg-success' : 'bg-error'"
              />
              <span :class="data?.summary.servers?.status === 'healthy' ? 'text-success' : 'text-error'">
                {{ data?.summary.servers?.status === "healthy" ? $t("page.home.dashboard.healthy") : $t("page.home.dashboard.down") }}
              </span>
            </div>
            <div class="mt-10px text-28px font-700 tabular-nums">
              {{ formatNumber(data?.summary.servers?.healthy) }}
              <span class="text-16px font-500 text-base-text-3">/ {{ formatNumber(data?.summary.servers?.total) }}</span>
            </div>
            <div class="mt-6px text-12px text-base-text-3">{{ $t("page.home.dashboard.runningNormally") }}</div>
          </div>

          <div class="metric-cell px-20px py-18px">
            <div class="text-13px text-base-text-2">{{ $t("page.home.dashboard.activeUsers") }}</div>
            <div class="mt-10px flex items-baseline gap-10px">
              <span class="text-28px font-700 tabular-nums">{{ formatNumber(data?.summary.activeUsers?.today) }}</span>
              <span :class="changeClass(data?.summary.activeUsers?.changePercent)" class="text-13px font-600 tabular-nums">
                {{ changeText(data?.summary.activeUsers?.changePercent) }}
              </span>
            </div>
            <div class="mt-6px text-12px text-base-text-3">
              {{ $t("page.home.dashboard.yesterday") }} {{ formatNumber(data?.summary.activeUsers?.yesterday) }}
            </div>
          </div>

          <div class="metric-cell px-20px py-18px">
            <div class="text-13px text-base-text-2">{{ $t("page.home.dashboard.todayTasks") }}</div>
            <div class="mt-10px flex items-baseline gap-10px">
              <span class="text-28px font-700 tabular-nums">{{ formatNumber(data?.summary.tasks?.today) }}</span>
              <span :class="changeClass(data?.summary.tasks?.changePercent)" class="text-13px font-600 tabular-nums">
                {{ changeText(data?.summary.tasks?.changePercent) }}
              </span>
            </div>
            <div class="mt-6px text-12px text-base-text-3">
              {{ $t("page.home.dashboard.yesterday") }} {{ formatNumber(data?.summary.tasks?.yesterday) }}
            </div>
          </div>

          <div class="metric-cell px-20px py-18px">
            <div class="text-13px text-base-text-2">{{ $t("page.home.dashboard.apiErrorRate") }}</div>
            <div class="mt-10px flex items-baseline gap-10px">
              <span class="text-28px font-700 tabular-nums">{{ formatPercent(data?.summary.apiErrorRate?.today) }}</span>
              <span :class="changeClass(data?.summary.apiErrorRate?.changePoints, true)" class="text-13px font-600 tabular-nums">
                {{ changeText(data?.summary.apiErrorRate?.changePoints, $t("page.home.dashboard.percentagePoints")) }}
              </span>
            </div>
            <div class="mt-6px text-12px text-base-text-3">
              {{ $t("page.home.dashboard.yesterday") }} {{ formatPercent(data?.summary.apiErrorRate?.yesterday) }}
            </div>
          </div>
        </div>

        <div class="px-20px pb-12px pt-16px">
          <NButtonGroup size="small">
            <NButton :type="chartMetric === 'requests' ? 'primary' : 'default'" @click="chartMetric = 'requests'">
              {{ $t("page.home.dashboard.requestCount") }}
            </NButton>
            <NButton :type="chartMetric === 'latency' ? 'primary' : 'default'" @click="chartMetric = 'latency'">
              {{ $t("page.home.dashboard.averageResponseTime") }}
            </NButton>
          </NButtonGroup>
          <div ref="chartRef" class="mt-8px h-250px" />
        </div>

        <div class="system-grid grid grid-cols-1 border-t border-theme-default sm:grid-cols-2 xl:grid-cols-4">
          <div class="system-cell px-20px py-15px">
            <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.systemUptime") }}</div>
            <div class="mt-6px text-16px font-600 tabular-nums">{{ formatDuration(data?.system.uptimeSeconds) }}</div>
          </div>
          <div class="system-cell px-20px py-15px">
            <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.queueDepth") }}</div>
            <div class="mt-6px flex items-center gap-10px">
              <span class="text-16px font-600 tabular-nums">{{ formatNumber(data?.system.queueDepth) }}</span>
              <span :class="changeClass(data?.system.queueDepthChangePercent, true)" class="text-12px tabular-nums">
                {{ changeText(data?.system.queueDepthChangePercent) }}
              </span>
            </div>
          </div>
          <div class="system-cell px-20px py-15px">
            <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.lastDataSync") }}</div>
            <div class="mt-6px flex items-center gap-8px text-16px font-600 tabular-nums">
              {{ formatSyncTime(data?.system.lastSyncAt) }}
              <span class="size-7px rd-full" :class="data?.system.syncStatus === 'healthy' ? 'bg-success' : 'bg-warning'" />
            </div>
          </div>
          <div class="system-cell px-20px py-15px">
            <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.taskSuccessRate7d") }}</div>
            <div class="mt-6px flex items-center gap-10px">
              <span class="text-16px font-600 tabular-nums">{{ formatPercent(data?.system.taskSuccessRate7D) }}</span>
              <span :class="changeClass(data?.system.taskSuccessRateChangePoints)" class="text-12px tabular-nums">
                {{ changeText(data?.system.taskSuccessRateChangePoints, $t("page.home.dashboard.percentagePoints")) }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </NSpin>
  </NCard>
</template>

<style scoped>
  @media (min-width: 640px) {
    .metric-cell:not(:nth-child(2n + 1)),
    .system-cell:not(:nth-child(2n + 1)) {
      border-left: 1px solid var(--border-color);
    }
  }

  @media (min-width: 1280px) {
    .metric-cell:not(:first-child),
    .system-cell:not(:first-child) {
      border-left: 1px solid var(--border-color);
    }
  }
</style>
