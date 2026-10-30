<script setup lang="ts">
  import { computed, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import { useEcharts, type ECOption } from "@/hooks/common/echarts"
  import { $t } from "@/locales"
  import { formatApiTime, parseApiTime } from "@/utils/datetime"

  defineOptions({ name: "OverviewChart" })
  const props = defineProps<{
    kind: "completion" | "depth" | "tasks" | "workers"
    dashboard: Api.Worker.QueueDashboard | null
    tasks?: Api.Worker.TaskGroupItem[]
    workers?: Api.Worker.TaskStatsByWorker[]
  }>()
  const emit = defineEmits<{ select: [name: string] }>()
  const theme = useThemeVars()
  function options(): ECOption {
    const colors = theme.value
    const success = $t("page.manage.worker.overview.success")
    const failure = $t("page.manage.worker.overview.failure")
    const base: ECOption = {
      color: [colors.successColor, colors.errorColor],
      textStyle: { color: colors.textColor2 },
      tooltip: { trigger: "axis", confine: true },
      legend: { top: 0, textStyle: { color: colors.textColor2 } },
      grid: { left: 12, right: 20, top: 40, bottom: 12, containLabel: true },
    }
    if (props.kind === "tasks" || props.kind === "workers") {
      const rows =
        props.kind === "tasks"
          ? (props.tasks ?? []).map((row) => ({ name: row.taskName, success: row.success, failure: row.failure }))
          : (props.workers ?? []).map((row) => ({
              name: row.workerHostname,
              success: row.success,
              failure: row.failure,
            }))
      return {
        ...base,
        xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: colors.borderColor } } },
        yAxis: {
          type: "category",
          inverse: true,
          triggerEvent: true,
          data: rows.map((row) => row.name),
          axisLabel: { width: 150, overflow: "truncate" },
        },
        series: [
          {
            id: "success",
            name: success,
            type: "bar",
            stack: "outcomes",
            barMaxWidth: 18,
            data: rows.map((row) => row.success),
          },
          {
            id: "failure",
            name: failure,
            type: "bar",
            stack: "outcomes",
            barMaxWidth: 18,
            data: rows.map((row) => row.failure),
          },
        ],
      }
    }
    const timeline = props.dashboard?.timeline ?? []
    const depths = props.dashboard?.depthTimeline ?? []
    const daily = [...timeline, ...depths].some((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.timeBucket))
    const zone = props.dashboard?.timezone
    const pointTime = (value: string) => (daily ? value : parseApiTime(value, zone).valueOf())
    return {
      ...base,
      useUTC: true,
      xAxis: daily
        ? {
            type: "category",
            data: [...new Set([...timeline, ...depths].map((row) => row.timeBucket))].sort(),
            axisLabel: { hideOverlap: true },
            axisLine: { lineStyle: { color: colors.borderColor } },
          }
        : {
            type: "time",
            axisLabel: {
              hideOverlap: true,
              formatter: (value: number) => formatApiTime(new Date(value).toISOString(), zone, "MM-DD HH:mm"),
            },
            axisLine: { lineStyle: { color: colors.borderColor } },
            axisPointer: {
              label: {
                formatter: ({ value }: { value: string | number | Date }) =>
                  formatApiTime((value instanceof Date ? value : new Date(value)).toISOString(), zone),
              },
            },
          },
      yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: colors.borderColor, type: "dashed" } } },
      series:
        props.kind === "completion"
          ? [
              {
                id: "success",
                name: success,
                type: "line",
                showSymbol: false,
                smooth: false,
                areaStyle: { opacity: 0.08 },
                data: timeline.map((row) => [pointTime(row.timeBucket), row.success]),
              },
              {
                id: "failure",
                name: failure,
                type: "line",
                showSymbol: false,
                smooth: false,
                data: timeline.map((row) => [pointTime(row.timeBucket), row.failure]),
              },
            ]
          : [
              {
                id: "depth",
                name: $t("page.manage.worker.overview.depth"),
                type: "line",
                color: colors.primaryColor,
                showSymbol: depths.filter((row) => row.depth !== null).length < 3,
                smooth: false,
                connectNulls: false,
                areaStyle: { opacity: 0.1 },
                data: depths.map((row) => [pointTime(row.timeBucket), row.depth]),
              },
            ],
    }
  }
  const chartData = computed(() => {
    switch (props.kind) {
      case "completion":
        return props.dashboard?.timeline.map((row) => [row.timeBucket, row.success, row.failure])
      case "depth":
        return props.dashboard?.depthTimeline.map((row) => [row.timeBucket, row.depth])
      case "tasks":
        return props.tasks?.map((row) => [row.taskName, row.success, row.failure])
      case "workers":
        return props.workers?.map((row) => [row.workerHostname, row.success, row.failure])
    }
  })
  function selectRanking(event: { componentType?: string; targetType?: string; name?: string; value?: unknown }) {
    if (props.kind !== "tasks" && props.kind !== "workers") return
    const name =
      event.componentType === "series"
        ? event.name
        : event.componentType === "yAxis" && event.targetType === "axisLabel"
          ? event.value
          : undefined
    const names =
      props.kind === "tasks" ? props.tasks?.map((row) => row.taskName) : props.workers?.map((row) => row.workerHostname)
    if (typeof name === "string" && names?.includes(name)) emit("select", name)
  }
  const { domRef, updateOptions } = useEcharts(options, {
    onRender: (chart) => {
      chart.on("click", selectRanking)
    },
    onDestroy: (chart) => {
      chart.off("click", selectRanking)
    },
  })
  watch(
    () => [
      chartData.value,
      props.kind,
      props.dashboard?.timezone,
      theme.value,
      $t("page.manage.worker.overview.success"),
      $t("page.manage.worker.overview.failure"),
      $t("page.manage.worker.overview.depth"),
    ],
    () => updateOptions(() => options(), { clear: false }),
    { deep: true, immediate: true },
  )
</script>

<template>
  <div
    ref="domRef"
    class="h-280px w-full"
    role="img"
    :aria-label="
      kind === 'depth'
        ? $t('page.manage.worker.overview.depthTrend')
        : kind === 'completion'
          ? $t('page.manage.worker.overview.completionTrend')
          : kind === 'tasks'
            ? $t('page.manage.worker.overview.taskRanking')
            : $t('page.manage.worker.overview.workerRanking')
    "
  />
</template>
