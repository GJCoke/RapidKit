<script setup lang="ts">
  import { ref, watch } from "vue"
  import { useEcharts } from "@/hooks/common/echarts"
  import { $t } from "@/locales"
  import {
    fetchTaskStatsByName,
    fetchTaskStatsByWorker,
    fetchTaskStatsSummary,
    fetchTaskStatsTimeline,
  } from "@/service/api"

  defineOptions({
    name: "StatsPanel",
  })

  // ==================== State ====================
  const days = ref(7)
  const loading = ref(false)
  const summary = ref<Api.Worker.TaskStatsSummary>({
    total: 0,
    success: 0,
    failure: 0,
    retry: 0,
    revoked: 0,
    successRate: 0,
    avgRuntime: null,
  })

  // ==================== Timeline Chart ====================
  const { domRef: timelineRef, updateOptions: updateTimeline } = useEcharts(() => ({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross", label: { backgroundColor: "#6a7985" } },
    },
    legend: {
      data: [$t("page.manage.worker.taskStatusMaps.success"), $t("page.manage.worker.taskStatusMaps.failure")],
      top: "0",
    },
    grid: { left: "3%", right: "4%", bottom: "3%", top: "15%", containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: [] as string[] },
    yAxis: { type: "value" },
    series: [
      {
        color: "#18a058",
        name: $t("page.manage.worker.taskStatusMaps.success"),
        type: "line",
        smooth: true,
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0.25, color: "rgba(24, 160, 88, 0.4)" },
              { offset: 1, color: "rgba(24, 160, 88, 0)" },
            ],
          },
        },
        data: [] as number[],
      },
      {
        color: "#d03050",
        name: $t("page.manage.worker.taskStatusMaps.failure"),
        type: "line",
        smooth: true,
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0.25, color: "rgba(208, 48, 80, 0.4)" },
              { offset: 1, color: "rgba(208, 48, 80, 0)" },
            ],
          },
        },
        data: [] as number[],
      },
    ],
  }))

  // ==================== Pie Chart ====================
  const { domRef: pieRef, updateOptions: updatePie } = useEcharts(() => ({
    tooltip: { trigger: "item" },
    legend: { bottom: "1%", left: "center", itemStyle: { borderWidth: 0 } },
    series: [
      {
        color: ["#18a058", "#d03050", "#f0a020", "#909399"],
        name: $t("page.manage.worker.stats.statusDistribution"),
        type: "pie",
        radius: ["45%", "75%"],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: "#fff", borderWidth: 1 },
        label: { show: false, position: "center" },
        emphasis: { label: { show: true, fontSize: "12" } },
        labelLine: { show: false },
        data: [] as { name: string; value: number }[],
      },
    ],
  }))

  // ==================== Bar Chart (by task name) ====================
  const { domRef: taskBarRef, updateOptions: updateTaskBar } = useEcharts(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      data: [$t("page.manage.worker.taskStatusMaps.success"), $t("page.manage.worker.taskStatusMaps.failure")],
      top: "0",
    },
    grid: { left: "3%", right: "4%", bottom: "3%", top: "15%", containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: [] as string[], inverse: true },
    series: [
      {
        name: $t("page.manage.worker.taskStatusMaps.success"),
        type: "bar",
        stack: "total",
        color: "#18a058",
        data: [] as number[],
      },
      {
        name: $t("page.manage.worker.taskStatusMaps.failure"),
        type: "bar",
        stack: "total",
        color: "#d03050",
        data: [] as number[],
      },
    ],
  }))

  // ==================== Bar Chart (by worker) ====================
  const { domRef: workerBarRef, updateOptions: updateWorkerBar } = useEcharts(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      data: [$t("page.manage.worker.taskStatusMaps.success"), $t("page.manage.worker.taskStatusMaps.failure")],
      top: "0",
    },
    grid: { left: "3%", right: "4%", bottom: "3%", top: "15%", containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: [] as string[], inverse: true },
    series: [
      {
        name: $t("page.manage.worker.taskStatusMaps.success"),
        type: "bar",
        stack: "total",
        color: "#18a058",
        data: [] as number[],
      },
      {
        name: $t("page.manage.worker.taskStatusMaps.failure"),
        type: "bar",
        stack: "total",
        color: "#d03050",
        data: [] as number[],
      },
    ],
  }))

  // ==================== Data Fetch ====================
  async function loadStats() {
    loading.value = true
    const params = { days: days.value }

    const [summaryRes, timelineRes, byNameRes, byWorkerRes] = await Promise.all([
      fetchTaskStatsSummary(params),
      fetchTaskStatsTimeline(params),
      fetchTaskStatsByName(params),
      fetchTaskStatsByWorker(params),
    ])

    // Summary
    if (!summaryRes.error) {
      summary.value = summaryRes.data
    }

    // Timeline
    if (!timelineRes.error) {
      const data = timelineRes.data
      updateTimeline((opts) => {
        opts.xAxis.data = data.map((d) => d.timeBucket.slice(5))
        opts.series[0].data = data.map((d) => d.success)
        opts.series[1].data = data.map((d) => d.failure)
        return opts
      })
    }

    // Pie
    if (!summaryRes.error) {
      const s = summaryRes.data
      updatePie((opts) => {
        opts.series[0].data = [
          { name: $t("page.manage.worker.taskStatusMaps.success"), value: s.success },
          { name: $t("page.manage.worker.taskStatusMaps.failure"), value: s.failure },
          { name: $t("page.manage.worker.taskStatusMaps.retry"), value: s.retry },
          { name: $t("page.manage.worker.taskStatusMaps.revoked"), value: s.revoked },
        ].filter((d) => d.value > 0)
        return opts
      })
    }

    // By Name
    if (!byNameRes.error) {
      const data = byNameRes.data
      updateTaskBar((opts) => {
        opts.yAxis.data = data.map((d) => d.taskName.split(".").pop() || d.taskName)
        opts.series[0].data = data.map((d) => d.success)
        opts.series[1].data = data.map((d) => d.failure)
        return opts
      })
    }

    // By Worker
    if (!byWorkerRes.error) {
      const data = byWorkerRes.data
      updateWorkerBar((opts) => {
        opts.yAxis.data = data.map((d) => d.workerHostname)
        opts.series[0].data = data.map((d) => d.success)
        opts.series[1].data = data.map((d) => d.failure)
        return opts
      })
    }

    loading.value = false
  }

  // ==================== Watch & Init ====================
  watch(days, () => loadStats())
  loadStats()
</script>

<template>
  <NCard :title="$t('page.manage.worker.stats.title')" :bordered="false" size="small" class="card-wrapper">
    <template #header-extra>
      <NRadioGroup v-model:value="days" size="small">
        <NRadioButton :value="1">{{ $t("page.manage.worker.stats.last24h") }}</NRadioButton>
        <NRadioButton :value="7">{{ $t("page.manage.worker.stats.last7d") }}</NRadioButton>
        <NRadioButton :value="30">{{ $t("page.manage.worker.stats.last30d") }}</NRadioButton>
      </NRadioGroup>
    </template>

    <NSpin :show="loading">
      <!-- Summary Cards -->
      <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive class="mb-16px">
        <NGridItem span="24 s:12 m:6">
          <NCard size="small" embedded>
            <NStatistic :label="$t('page.manage.worker.stats.totalTasks')" :value="summary.total" />
          </NCard>
        </NGridItem>
        <NGridItem span="24 s:12 m:6">
          <NCard size="small" embedded>
            <NStatistic :label="$t('page.manage.worker.stats.successRate')">
              <template #default>
                <span
                  :class="
                    summary.successRate >= 90
                      ? 'text-green-500'
                      : summary.successRate >= 70
                        ? 'text-orange-500'
                        : 'text-red-500'
                  "
                >
                  {{ summary.successRate }}%
                </span>
              </template>
            </NStatistic>
          </NCard>
        </NGridItem>
        <NGridItem span="24 s:12 m:6">
          <NCard size="small" embedded>
            <NStatistic :label="$t('page.manage.worker.stats.avgRuntime')">
              <template #default>
                {{ summary.avgRuntime !== null ? `${summary.avgRuntime}s` : "-" }}
              </template>
            </NStatistic>
          </NCard>
        </NGridItem>
        <NGridItem span="24 s:12 m:6">
          <NCard size="small" embedded>
            <NStatistic :label="$t('page.manage.worker.stats.failureCount')">
              <template #default>
                <span :class="summary.failure > 0 ? 'text-red-500' : ''">{{ summary.failure }}</span>
              </template>
            </NStatistic>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Charts Row 1: Timeline + Pie -->
      <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive class="mb-16px">
        <NGridItem span="24 m:16">
          <NCard size="small" :title="$t('page.manage.worker.stats.timeline')" embedded>
            <div ref="timelineRef" class="h-300px"></div>
          </NCard>
        </NGridItem>
        <NGridItem span="24 m:8">
          <NCard size="small" :title="$t('page.manage.worker.stats.statusDistribution')" embedded>
            <div ref="pieRef" class="h-300px"></div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Charts Row 2: By Name + By Worker -->
      <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
        <NGridItem span="24 m:12">
          <NCard size="small" :title="$t('page.manage.worker.stats.topTasks')" embedded>
            <div ref="taskBarRef" class="h-300px"></div>
          </NCard>
        </NGridItem>
        <NGridItem span="24 m:12">
          <NCard size="small" :title="$t('page.manage.worker.stats.workerLoad')" embedded>
            <div ref="workerBarRef" class="h-300px"></div>
          </NCard>
        </NGridItem>
      </NGrid>
    </NSpin>
  </NCard>
</template>
