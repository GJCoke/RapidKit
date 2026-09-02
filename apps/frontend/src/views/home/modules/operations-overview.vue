<script setup lang="ts">
  import { computed, watch } from "vue"
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
    rangeChange: [range: "7d"]
    retry: []
  }>()

  const rangeOptions = computed(() => [{ label: $t("page.home.dashboard.last7Days"), value: "7d" }])
  const requestSeriesName = computed(
    () => `${$t("page.home.dashboard.requestCount")}（${$t("page.home.dashboard.times")}）`,
  )
  const latencySeriesName = computed(() => `${$t("page.home.dashboard.averageResponseTime")}（ms）`)

  function themeColor(token: string, fallback: string) {
    if (typeof document === "undefined") return fallback
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    if (!value) return fallback
    return /^\d+\s+\d+\s+\d+$/.test(value) ? `rgb(${value.replaceAll(" ", ", ")})` : value
  }

  const { domRef: chartRef, updateOptions } = useEcharts(() => ({
    animationDuration: 480,
    color: [themeColor("--primary-color", "#4361ee"), themeColor("--success-color", "#2ec4b6")],
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "line" as const, lineStyle: { type: "dashed" as const, opacity: 0.38 } },
    },
    legend: {
      left: 0,
      top: 0,
      itemWidth: 15,
      itemHeight: 3,
      icon: "rect",
      textStyle: { fontSize: 12 },
      data: [requestSeriesName.value, latencySeriesName.value],
    },
    grid: { left: 4, right: 4, top: 42, bottom: 4, containLabel: true },
    xAxis: {
      type: "category" as const,
      boundaryGap: false,
      data: (props.data?.trend ?? []).map((point) => point.date.slice(5).replace("-", "/")),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { margin: 14, fontSize: 12 },
    },
    yAxis: [
      {
        type: "value" as const,
        min: 0,
        max: 20000,
        minInterval: 1,
        splitNumber: 2,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          margin: 14,
          fontSize: 12,
          formatter: (value: number) => (value >= 1000 ? `${value / 1000}K` : String(value)),
        },
      },
      {
        type: "value" as const,
        min: 0,
        max: 800,
        interval: 400,
        splitNumber: 2,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { margin: 14, fontSize: 12 },
      },
    ],
    series: [
      {
        name: requestSeriesName.value,
        type: "line" as const,
        smooth: false,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { width: 2, color: themeColor("--primary-color", "#4361ee") },
        itemStyle: { color: themeColor("--primary-color", "#4361ee"), borderWidth: 1.5, borderColor: "#fff" },
        areaStyle: { color: themeColor("--primary-color", "#4361ee"), opacity: 0.07 },
        data: (props.data?.trend ?? []).map((point) => point.requestCount),
      },
      {
        name: latencySeriesName.value,
        type: "line" as const,
        yAxisIndex: 1,
        smooth: false,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { width: 2, color: themeColor("--success-color", "#2ec4b6") },
        itemStyle: { color: themeColor("--success-color", "#2ec4b6"), borderWidth: 1.5, borderColor: "#fff" },
        data: (props.data?.trend ?? []).map((point) => point.avgResponseMs),
      },
    ],
  }))

  function updateChart() {
    updateOptions((_options, optionsFactory) => optionsFactory())
  }

  watch(() => props.data, updateChart, { deep: true, immediate: true })

  function formatNumber(value: number | null | undefined) {
    return value == null ? "—" : new Intl.NumberFormat().format(value)
  }

  function formatPercent(value: number | null | undefined) {
    return value == null ? "—" : `${value.toFixed(2)}%`
  }

  function changeText(value: number | null | undefined, unit = "%") {
    if (value == null) return "—"
    return `${Math.abs(value).toFixed(2)}${unit}`
  }

  function changeClass(value: number | null | undefined, inverted = false) {
    if (value == null || value === 0) return "text-base-text-3"
    const positive = inverted ? value < 0 : value > 0
    return positive ? "text-success" : "text-error"
  }

  function changeIcon(value: number | null | undefined) {
    if (!value) return "carbon:subtract"
    return value > 0 ? "carbon:arrow-up" : "carbon:arrow-down"
  }

  function formatDuration(seconds: number | undefined) {
    if (seconds == null) return "—"
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${days} ${$t("page.home.dashboard.days")} ${hours} ${$t("page.home.dashboard.hours")} ${minutes} ${$t("page.home.dashboard.minutes")}`
  }

  function formatSyncTime(value: string | null | undefined) {
    if (!value) return "—"
    const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
    if (diffSeconds < 3600) return `${Math.max(1, Math.floor(diffSeconds / 60))} ${$t("page.home.dashboard.minutes")}`
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  }

  function serverLabel() {
    const status = props.data?.summary.servers?.status
    if (status === "healthy") return $t("page.home.dashboard.healthy")
    if (status === "degraded") return $t("page.home.dashboard.degraded")
    return $t("page.home.dashboard.down")
  }
</script>

<template>
  <NCard bordered class="operations-card" content-style="padding: 0">
    <div class="operations-header flex items-center justify-between px-18px pb-8px pt-14px sm:px-20px sm:pt-16px">
      <h2 class="m-0 text-16px font-700 text-base-text-1">{{ $t("page.home.dashboard.operationsOverview") }}</h2>
      <NSelect
        class="w-92px"
        size="small"
        :value="'7d'"
        :options="rangeOptions"
        :consistent-menu-width="false"
        @update:value="emit('rangeChange', '7d')"
      />
    </div>

    <NSpin :show="loading">
      <div v-if="error && !data" class="min-h-390px flex-col-center gap-12px">
        <NEmpty :description="$t('page.home.dashboard.overviewUnavailable')" />
        <NButton size="small" type="primary" @click="emit('retry')">{{ $t("page.home.dashboard.retry") }}</NButton>
      </div>

      <template v-else>
        <div class="metric-grid grid grid-cols-1 px-18px pb-12px pt-6px sm:grid-cols-2 sm:px-20px xl:grid-cols-4">
          <div class="metric-cell py-10px xl:pr-22px">
            <div class="flex items-center gap-8px text-13px text-base-text-2">
              <span>{{ $t("page.home.dashboard.serverStatus") }}</span>
              <span
                class="size-7px rd-full"
                :class="
                  data?.summary.servers?.status === 'healthy'
                    ? 'bg-success'
                    : data?.summary.servers?.status === 'degraded'
                      ? 'bg-warning'
                      : 'bg-error'
                "
              />
              <span
                :class="
                  data?.summary.servers?.status === 'healthy'
                    ? 'text-success'
                    : data?.summary.servers?.status === 'degraded'
                      ? 'text-warning'
                      : 'text-error'
                "
              >
                {{ serverLabel() }}
              </span>
            </div>
            <div class="mt-9px text-28px font-600 leading-34px tabular-nums text-base-text-1">
              {{ formatNumber(data?.summary.servers?.healthy) }}
              <span class="ml-3px text-15px font-500 text-base-text-3"
                >/ {{ formatNumber(data?.summary.servers?.total) }}</span
              >
            </div>
            <div class="mt-5px text-13px text-base-text-3">{{ $t("page.home.dashboard.runningNormally") }}</div>
          </div>

          <div class="metric-cell py-10px sm:pl-22px xl:px-22px">
            <div class="text-13px text-base-text-2">{{ $t("page.home.dashboard.activeUsers") }}</div>
            <div class="mt-9px flex items-baseline gap-10px">
              <span class="text-28px font-600 leading-34px tabular-nums text-base-text-1">{{
                formatNumber(data?.summary.activeUsers?.today)
              }}</span>
              <span
                :class="changeClass(data?.summary.activeUsers?.changePercent)"
                class="inline-flex items-center gap-3px text-13px font-600 tabular-nums"
              >
                <SvgIcon :icon="changeIcon(data?.summary.activeUsers?.changePercent)" class="text-13px" />
                {{ changeText(data?.summary.activeUsers?.changePercent) }}
              </span>
            </div>
            <div class="mt-5px text-13px text-base-text-3">
              {{ $t("page.home.dashboard.yesterday") }} {{ formatNumber(data?.summary.activeUsers?.yesterday) }}
            </div>
          </div>

          <div class="metric-cell py-10px xl:px-22px">
            <div class="text-13px text-base-text-2">{{ $t("page.home.dashboard.todayTasks") }}</div>
            <div class="mt-9px flex items-baseline gap-10px">
              <span class="text-28px font-600 leading-34px tabular-nums text-base-text-1">{{
                formatNumber(data?.summary.tasks?.today)
              }}</span>
              <span
                :class="changeClass(data?.summary.tasks?.changePercent)"
                class="inline-flex items-center gap-3px text-13px font-600 tabular-nums"
              >
                <SvgIcon :icon="changeIcon(data?.summary.tasks?.changePercent)" class="text-13px" />
                {{ changeText(data?.summary.tasks?.changePercent) }}
              </span>
            </div>
            <div class="mt-5px text-13px text-base-text-3">
              {{ $t("page.home.dashboard.yesterday") }} {{ formatNumber(data?.summary.tasks?.yesterday) }}
            </div>
          </div>

          <div class="metric-cell py-10px sm:pl-22px xl:pl-22px">
            <div class="text-13px text-base-text-2">{{ $t("page.home.dashboard.apiErrorRate") }}</div>
            <div class="mt-9px flex items-baseline gap-10px">
              <span class="whitespace-nowrap text-28px font-600 leading-34px tabular-nums text-base-text-1">{{
                formatPercent(data?.summary.apiErrorRate?.today)
              }}</span>
              <span
                :class="changeClass(data?.summary.apiErrorRate?.changePoints, true)"
                class="inline-flex items-center gap-3px text-13px font-600 tabular-nums"
              >
                <SvgIcon :icon="changeIcon(data?.summary.apiErrorRate?.changePoints)" class="text-13px" />
                {{ changeText(data?.summary.apiErrorRate?.changePoints) }}
              </span>
            </div>
            <div class="mt-5px text-13px text-base-text-3">
              {{ $t("page.home.dashboard.yesterday") }} {{ formatPercent(data?.summary.apiErrorRate?.yesterday) }}
            </div>
          </div>
        </div>

        <div class="px-18px pb-14px sm:px-20px">
          <div ref="chartRef" class="h-190px sm:h-200px" />
        </div>

        <div class="system-divider mx-18px border-t sm:mx-20px">
          <div class="system-grid grid grid-cols-1 py-8px sm:grid-cols-2 xl:grid-cols-4">
            <div class="system-cell py-8px xl:pr-20px">
              <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.systemUptime") }}</div>
              <div class="mt-5px text-14px font-500 tabular-nums text-base-text-1">
                {{ formatDuration(data?.system.uptimeSeconds) }}
              </div>
              <div class="mt-6px flex items-center gap-7px text-12px text-success">
                <span class="size-7px rd-full bg-success" />{{ $t("page.home.dashboard.healthy") }}
              </div>
            </div>
            <div class="system-cell py-8px sm:pl-20px xl:px-20px">
              <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.queueDepth") }}</div>
              <div class="mt-5px text-14px font-500 tabular-nums text-base-text-1">
                {{ formatNumber(data?.system.queueDepth) }}
              </div>
              <div class="mt-6px flex items-center gap-5px text-12px text-base-text-3">
                {{ $t("page.home.dashboard.yesterday") }}
                <span
                  :class="changeClass(data?.system.queueDepthChangePercent, true)"
                  class="inline-flex items-center gap-2px tabular-nums"
                >
                  <SvgIcon :icon="changeIcon(data?.system.queueDepthChangePercent)" class="text-12px" />{{
                    changeText(data?.system.queueDepthChangePercent)
                  }}
                </span>
              </div>
            </div>
            <div class="system-cell py-8px xl:px-20px">
              <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.lastDataSync") }}</div>
              <div class="mt-5px text-14px font-500 tabular-nums text-base-text-1">
                {{ formatSyncTime(data?.system.lastSyncAt) }}
              </div>
              <div
                class="mt-6px flex items-center gap-7px text-12px"
                :class="data?.system.syncStatus === 'healthy' ? 'text-success' : 'text-warning'"
              >
                <span
                  class="size-7px rd-full"
                  :class="data?.system.syncStatus === 'healthy' ? 'bg-success' : 'bg-warning'"
                />
                {{
                  data?.system.syncStatus === "healthy"
                    ? $t("page.home.dashboard.healthy")
                    : $t("page.home.dashboard.degraded")
                }}
              </div>
            </div>
            <div class="system-cell py-8px sm:pl-20px xl:pl-20px">
              <div class="text-12px text-base-text-3">{{ $t("page.home.dashboard.taskSuccessRate7d") }}</div>
              <div class="mt-5px flex items-baseline gap-10px">
                <span class="text-20px font-600 tabular-nums text-base-text-1">{{
                  formatPercent(data?.system.taskSuccessRate7D)
                }}</span>
                <span
                  :class="changeClass(data?.system.taskSuccessRateChangePoints)"
                  class="inline-flex items-center gap-2px text-12px tabular-nums"
                >
                  <SvgIcon :icon="changeIcon(data?.system.taskSuccessRateChangePoints)" class="text-12px" />{{
                    changeText(data?.system.taskSuccessRateChangePoints)
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </NSpin>
  </NCard>
</template>

<style scoped>
  .operations-card {
    border-color: var(--n-border-color);
    border-radius: 8px;
    box-shadow: 0 1px 3px rgb(15 23 42 / 4%);
  }

  .system-divider {
    border-color: var(--n-border-color);
  }

  @media (max-width: 639px) {
    .metric-cell + .metric-cell,
    .system-cell + .system-cell {
      border-top: 1px solid var(--n-border-color);
    }
  }

  @media (min-width: 640px) and (max-width: 1279px) {
    .metric-cell:nth-child(even),
    .system-cell:nth-child(even) {
      border-left: 1px solid var(--n-border-color);
    }

    .metric-cell:nth-child(n + 3),
    .system-cell:nth-child(n + 3) {
      border-top: 1px solid var(--n-border-color);
    }
  }

  @media (min-width: 680px) {
    .metric-grid,
    .system-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .metric-cell:nth-child(n),
    .system-cell:nth-child(n) {
      border-top: 0;
    }

    .metric-cell + .metric-cell,
    .system-cell + .system-cell {
      border-left: 1px solid var(--n-border-color);
      padding-left: 20px;
    }
  }

  @media (min-width: 1280px) {
    .metric-cell + .metric-cell,
    .system-cell + .system-cell {
      border-left: 1px solid var(--n-border-color);
    }
  }
</style>
