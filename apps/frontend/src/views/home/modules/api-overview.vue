<script setup lang="ts">
  import { watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardApiOverview" })

  const props = defineProps<{
    distribution: Api.Monitoring.ApiDistributionItem[]
    topFailures: Api.Monitoring.ApiTopItem[]
    trend: Api.Monitoring.ApiTrendPoint[]
  }>()

  // Pie chart
  const { domRef: pieRef, setOptions: setPieChart } = useEcharts(() => ({
    tooltip: { trigger: "item" as const, formatter: "{b}: {c} ({d}%)" },
    legend: { show: false },
    series: [
      {
        type: "pie" as const,
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: "bold" } },
        data: [] as { name: string; value: number }[],
      },
    ],
  }))

  // Sparkline
  const { domRef: sparkRef, setOptions: setSparkChart } = useEcharts(() => ({
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: "category" as const, show: false, data: [] as string[] },
    yAxis: { type: "value" as const, show: false },
    tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
    series: [
      {
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
        data: [] as number[],
      },
    ],
  }))

  watch(
    () => props.distribution,
    (data) => {
      setPieChart({
        series: [
          {
            data: data.map((d) => ({
              name: `${d.method} ${d.path}`,
              value: d.requestCount,
            })),
          },
        ],
      })
    },
    { deep: true },
  )

  watch(
    () => props.trend,
    (data) => {
      setSparkChart({
        xAxis: { data: data.map((d) => d.timeBucket) },
        series: [{ data: data.map((d) => d.requestCount) }],
      })
    },
    { deep: true },
  )

  const methodColors: Record<string, string> = {
    GET: "#18a058",
    POST: "#2080f0",
    PUT: "#f0a020",
    DELETE: "#d03050",
    PATCH: "#8b5cf6",
  }
</script>

<template>
  <NCard :bordered="false" class="card-wrapper">
    <div class="flex items-center gap-8px text-15px font-600 mb-16px">
      <SvgIcon icon="carbon:api" class="text-16px text-primary" />
      {{ $t("page.home.dashboard.apiOverview") }}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-16px">
      <!-- Pie: Request Distribution -->
      <div>
        <div class="text-13px text-[var(--text-color-3)] mb-8px">{{ $t("page.home.dashboard.apiDistribution") }}</div>
        <div ref="pieRef" class="h-200px" />
      </div>

      <!-- Failures Top 5 -->
      <div>
        <div class="text-13px text-[var(--text-color-3)] mb-8px">{{ $t("page.home.dashboard.apiTopFailures") }}</div>
        <div v-if="topFailures.length === 0" class="h-200px flex-center text-[var(--text-color-4)]">
          {{ $t("page.home.dashboard.noData") }}
        </div>
        <div v-else class="flex flex-col gap-8px">
          <div
            v-for="(item, index) in topFailures.slice(0, 5)"
            :key="index"
            class="flex items-center gap-8px px-8px py-6px rd-6px bg-[var(--fill-color)]"
          >
            <NTag
              :bordered="false"
              size="small"
              :color="{ color: methodColors[item.method] || '#666', textColor: '#fff' }"
            >
              {{ item.method }}
            </NTag>
            <span class="flex-1 text-13px truncate font-mono">{{ item.path }}</span>
            <span class="text-13px text-error font-600">{{ item.errorCount }}</span>
            <span class="text-12px text-[var(--text-color-4)]">{{ item.errorRate }}%</span>
          </div>
        </div>
      </div>

      <!-- Sparkline: 24h Trend -->
      <div>
        <div class="text-13px text-[var(--text-color-3)] mb-8px">{{ $t("page.home.dashboard.apiTrend24h") }}</div>
        <div ref="sparkRef" class="h-200px" />
      </div>
    </div>
  </NCard>
</template>
