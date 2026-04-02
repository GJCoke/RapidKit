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
  const {
    domRef: timelineRef,
    updateOptions: updateTimeline,
    setOptions: setTimeline,
  } = useEcharts(() => ({
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
  const {
    domRef: pieRef,
    updateOptions: updatePie,
    setOptions: setPie,
  } = useEcharts(() => ({
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
  const {
    domRef: taskBarRef,
    updateOptions: updateTaskBar,
    setOptions: setTaskBar,
  } = useEcharts(() => ({
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
  const {
    domRef: workerBarRef,
    updateOptions: updateWorkerBar,
    setOptions: setWorkerBar,
  } = useEcharts(() => ({
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

  // ==================== Local State for Incremental Updates ====================

  /** 时间线数据（按小时桶） */
  const timelineData = ref<{ bucket: string; success: number; failure: number }[]>([])

  /** 按任务名统计 */
  const byNameData = ref<Map<string, { success: number; failure: number }>>(new Map())

  /** 按 Worker 统计 */
  const byWorkerData = ref<Map<string, { success: number; failure: number }>>(new Map())

  /** 成功任务的 runtime 累加（用于计算平均值） */
  let runtimeSum = 0
  let runtimeCount = 0

  // ==================== Data Fetch (初始加载 / 切换天数) ====================

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
      // 初始化 runtime 累加器
      if (summaryRes.data.avgRuntime !== null) {
        runtimeCount = summaryRes.data.success
        runtimeSum = summaryRes.data.avgRuntime * runtimeCount
      } else {
        runtimeCount = 0
        runtimeSum = 0
      }
    }

    // Timeline
    if (!timelineRes.error) {
      timelineData.value = timelineRes.data.map((d) => ({
        bucket: d.timeBucket,
        success: d.success,
        failure: d.failure,
      }))
      renderTimeline()
    }

    // By Name
    if (!byNameRes.error) {
      byNameData.value = new Map(byNameRes.data.map((d) => [d.taskName, { success: d.success, failure: d.failure }]))
      renderByName()
    }

    // By Worker
    if (!byWorkerRes.error) {
      byWorkerData.value = new Map(
        byWorkerRes.data.map((d) => [d.workerHostname, { success: d.success, failure: d.failure }]),
      )
      renderByWorker()
    }

    // Pie
    renderPie()

    loading.value = false
  }

  // ==================== Incremental Update (Socket 事件驱动) ====================

  /**
   * 处理 task:update 事件，纯前端增量更新，无 HTTP 请求。
   * 只处理终态事件（success/failure/retry/revoked），started 不计入统计。
   */
  function handleTaskUpdate(event: Api.Worker.TaskUpdateEvent) {
    const { status, taskName, workerHostname, runtime } = event
    const s = summary.value

    // started 不计入统计面板
    if (status === "2") return

    // 1. Summary 卡片增量
    s.total += 1
    if (status === "3") {
      s.success += 1
      if (runtime) {
        runtimeCount += 1
        runtimeSum += runtime
        s.avgRuntime = Math.round((runtimeSum / runtimeCount) * 1000) / 1000
      }
    } else if (status === "4") {
      s.failure += 1
    } else if (status === "5") {
      s.retry += 1
    } else if (status === "6") {
      s.revoked += 1
    }
    s.successRate = s.total > 0 ? Math.round((s.success / s.total) * 10000) / 100 : 0

    // 2. 时间线增量：找到当前小时桶
    const nowBucket = formatHourBucket(new Date())
    const bucketItem = timelineData.value.find((d) => d.bucket === nowBucket)
    if (bucketItem) {
      if (status === "3") bucketItem.success += 1
      else if (status === "4") bucketItem.failure += 1
    } else {
      // 新的小时桶
      timelineData.value.push({
        bucket: nowBucket,
        success: status === "3" ? 1 : 0,
        failure: status === "4" ? 1 : 0,
      })
    }
    renderTimeline(false)

    // 3. 按任务名增量
    if (taskName && (status === "3" || status === "4")) {
      const existing = byNameData.value.get(taskName)
      if (existing) {
        if (status === "3") existing.success += 1
        else existing.failure += 1
      } else {
        byNameData.value.set(taskName, {
          success: status === "3" ? 1 : 0,
          failure: status === "4" ? 1 : 0,
        })
      }
      renderByName(false)
    }

    // 4. 按 Worker 增量
    if (workerHostname && (status === "3" || status === "4")) {
      const existing = byWorkerData.value.get(workerHostname)
      if (existing) {
        if (status === "3") existing.success += 1
        else existing.failure += 1
      } else {
        byWorkerData.value.set(workerHostname, {
          success: status === "3" ? 1 : 0,
          failure: status === "4" ? 1 : 0,
        })
      }
      renderByWorker(false)
    }

    // 5. 饼图增量
    renderPie(false)
  }

  // ==================== Chart Render Helpers ====================

  function formatHourBucket(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    const h = String(date.getHours()).padStart(2, "0")
    return `${y}-${m}-${d} ${h}:00`
  }

  function renderTimeline(fullRender = true) {
    const data = timelineData.value
    const opts = {
      xAxis: { data: data.map((d) => d.bucket.slice(5)) },
      series: [{ data: data.map((d) => d.success) }, { data: data.map((d) => d.failure) }],
    }
    if (fullRender) {
      updateTimeline((o) => {
        o.xAxis.data = opts.xAxis.data
        o.series[0].data = opts.series[0].data
        o.series[1].data = opts.series[1].data
        return o
      })
    } else {
      setTimeline(opts)
    }
  }

  function renderPie(fullRender = true) {
    const s = summary.value
    const pieData = [
      { name: $t("page.manage.worker.taskStatusMaps.success"), value: s.success },
      { name: $t("page.manage.worker.taskStatusMaps.failure"), value: s.failure },
      { name: $t("page.manage.worker.taskStatusMaps.retry"), value: s.retry },
      { name: $t("page.manage.worker.taskStatusMaps.revoked"), value: s.revoked },
    ].filter((d) => d.value > 0)
    if (fullRender) {
      updatePie((o) => {
        o.series[0].data = pieData
        return o
      })
    } else {
      setPie({ series: [{ data: pieData }] })
    }
  }

  function renderByName(fullRender = true) {
    const sorted = [...byNameData.value.entries()]
      .sort((a, b) => b[1].success + b[1].failure - (a[1].success + a[1].failure))
      .slice(0, 10)
    const opts = {
      yAxis: { data: sorted.map(([name]) => name.split(".").pop() || name) },
      series: [{ data: sorted.map(([, v]) => v.success) }, { data: sorted.map(([, v]) => v.failure) }],
    }
    if (fullRender) {
      updateTaskBar((o) => {
        o.yAxis.data = opts.yAxis.data
        o.series[0].data = opts.series[0].data
        o.series[1].data = opts.series[1].data
        return o
      })
    } else {
      setTaskBar(opts)
    }
  }

  function renderByWorker(fullRender = true) {
    const sorted = [...byWorkerData.value.entries()].sort(
      (a, b) => b[1].success + b[1].failure - (a[1].success + a[1].failure),
    )
    const opts = {
      yAxis: { data: sorted.map(([name]) => name) },
      series: [{ data: sorted.map(([, v]) => v.success) }, { data: sorted.map(([, v]) => v.failure) }],
    }
    if (fullRender) {
      updateWorkerBar((o) => {
        o.yAxis.data = opts.yAxis.data
        o.series[0].data = opts.series[0].data
        o.series[1].data = opts.series[1].data
        return o
      })
    } else {
      setWorkerBar(opts)
    }
  }

  // ==================== Watch & Init ====================
  watch(days, () => loadStats())
  loadStats()

  defineExpose({ handleTaskUpdate })
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
