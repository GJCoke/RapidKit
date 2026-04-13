<script setup lang="tsx">
  import { onMounted, reactive, ref } from "vue"
  import { NTag } from "naive-ui"
  import { useMonitoring } from "./composables/use-monitoring"
  import MonitoringSummaryCards from "./modules/monitoring-summary-cards.vue"
  import MonitoringCharts from "./modules/monitoring-charts.vue"
  import MonitoringRankings from "./modules/monitoring-rankings.vue"
  import MonitoringSearch from "./modules/monitoring-search.vue"
  import { $t } from "@/locales"
  import { fetchApiList } from "@/service/api"
  import { useNaivePaginatedTable, defaultTransform } from "@/hooks/common/table"

  defineOptions({ name: "MonitoringApi" })

  const monitoring = useMonitoring()

  // Search params
  const searchModel = ref({ keyword: null as string | null, method: null as string | null })

  const searchParams: Record<string, string | number> = reactive({
    page: 1,
    pageSize: 10,
    range: "24h",
    sortBy: "request_count",
    sortOrder: "desc",
  })

  function syncSearch() {
    if (searchModel.value.keyword) {
      searchParams.keyword = searchModel.value.keyword
    } else {
      delete searchParams.keyword
    }
    if (searchModel.value.method) {
      searchParams.method = searchModel.value.method
    } else {
      delete searchParams.method
    }
    searchParams.range = monitoring.timeRange.value
    searchParams.page = 1
  }

  const {
    data: tableData,
    loading: tableLoading,
    columns,
    pagination,
    getData,
  } = useNaivePaginatedTable({
    api: () => fetchApiList({ ...searchParams }),
    columns: getColumns,
    transform: defaultTransform,
    immediate: false,
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page || 1
      searchParams.pageSize = params.pageSize || 10
    },
  })

  const methodColors: Record<string, { color: string; textColor: string }> = {
    GET: { color: "#18a05820", textColor: "#18a058" },
    POST: { color: "#2080f020", textColor: "#2080f0" },
    PUT: { color: "#f0a02020", textColor: "#f0a020" },
    DELETE: { color: "#d0305020", textColor: "#d03050" },
    PATCH: { color: "#8b5cf620", textColor: "#8b5cf6" },
  }

  function getColumns() {
    return [
      {
        title: $t("page.monitoring.api.method"),
        key: "method",
        width: 90,
        render: (row: Api.Monitoring.ApiListItem) => {
          const c = methodColors[row.method] || { color: "#66666620", textColor: "#666" }
          return (
            <NTag bordered={false} size="small" color={c}>
              {row.method}
            </NTag>
          )
        },
      },
      {
        title: $t("page.monitoring.api.path"),
        key: "path",
        ellipsis: { tooltip: true },
        render: (row: Api.Monitoring.ApiListItem) => <span class="font-mono text-13px">{row.path}</span>,
      },
      {
        title: $t("page.monitoring.api.requestCount"),
        key: "requestCount",
        width: 110,
        sorter: true,
        render: (row: Api.Monitoring.ApiListItem) => row.requestCount.toLocaleString(),
      },
      {
        title: $t("page.monitoring.api.errorCount"),
        key: "errorCount",
        width: 100,
        sorter: true,
        render: (row: Api.Monitoring.ApiListItem) => (
          <span class={row.errorCount > 0 ? "text-error font-600" : ""}>{row.errorCount}</span>
        ),
      },
      {
        title: $t("page.monitoring.api.errorRate"),
        key: "errorRate",
        width: 100,
        sorter: true,
        render: (row: Api.Monitoring.ApiListItem) => {
          const color = row.errorRate >= 5 ? "text-error" : row.errorRate >= 1 ? "text-warning" : ""
          return <span class={color}>{row.errorRate}%</span>
        },
      },
      {
        title: $t("page.monitoring.api.avgMs"),
        key: "avgMs",
        width: 130,
        sorter: true,
        render: (row: Api.Monitoring.ApiListItem) => `${row.avgMs} ms`,
      },
      {
        title: $t("page.monitoring.api.p95Ms"),
        key: "p95Ms",
        width: 130,
        sorter: true,
        render: (row: Api.Monitoring.ApiListItem) => {
          const color = row.p95Ms >= 3000 ? "text-error" : row.p95Ms >= 1000 ? "text-warning" : ""
          return <span class={color}>{row.p95Ms} ms</span>
        },
      },
    ]
  }

  function handleSorterChange(sorter: { columnKey?: string; order?: string } | null) {
    if (sorter && sorter.columnKey) {
      const fieldMap: Record<string, string> = {
        requestCount: "request_count",
        errorCount: "error_count",
        errorRate: "error_rate",
        avgMs: "avg_ms",
        p95Ms: "p95_ms",
      }
      searchParams.sortBy = fieldMap[sorter.columnKey] || sorter.columnKey
      searchParams.sortOrder = sorter.order === "ascend" ? "asc" : "desc"
    } else {
      searchParams.sortBy = "request_count"
      searchParams.sortOrder = "desc"
    }
    getData()
  }

  const rangeButtons: { key: Api.Monitoring.TimeRange; label: string }[] = [
    { key: "1h", label: $t("page.monitoring.api.last1h") },
    { key: "6h", label: $t("page.monitoring.api.last6h") },
    { key: "24h", label: $t("page.monitoring.api.last24h") },
    { key: "7d", label: $t("page.monitoring.api.last7d") },
  ]

  async function handleRangeChange(range: Api.Monitoring.TimeRange) {
    await monitoring.onTimeRangeChange(range)
    searchParams.range = range
    searchParams.page = 1
    getData()
  }

  function handleSearch() {
    syncSearch()
    getData()
  }

  function handleReset() {
    searchModel.value = { keyword: null, method: null }
    syncSearch()
    getData()
  }

  onMounted(() => {
    monitoring.loadInitialData()
    monitoring.setupSocket()
    getData()
  })
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <!-- Time Range Selector -->
    <NCard :bordered="false" class="card-wrapper">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-8px text-16px font-600">
          <SvgIcon icon="carbon:api" class="text-18px text-primary" />
          {{ $t("page.monitoring.api.title") }}
        </div>
        <NButtonGroup size="small">
          <NButton
            v-for="btn in rangeButtons"
            :key="btn.key"
            :type="monitoring.timeRange.value === btn.key ? 'primary' : 'default'"
            :tertiary="monitoring.timeRange.value !== btn.key"
            @click="handleRangeChange(btn.key)"
          >
            {{ btn.label }}
          </NButton>
        </NButtonGroup>
      </div>
    </NCard>

    <!-- Summary Cards -->
    <MonitoringSummaryCards :overview="monitoring.overview.value" />

    <!-- Charts: Distribution + Trend -->
    <MonitoringCharts :distribution="monitoring.distribution.value" :trend="monitoring.trend.value" />

    <!-- Rankings -->
    <MonitoringRankings :top-requests="monitoring.topRequests.value" :top-p95="monitoring.topP95.value" />

    <!-- Detail Table -->
    <NCard :bordered="false" class="card-wrapper">
      <div class="text-14px font-600 mb-12px">{{ $t("page.monitoring.api.detail") }}</div>
      <div class="mb-16px">
        <MonitoringSearch v-model:model="searchModel" @search="handleSearch" @reset="handleReset" />
      </div>
      <NDataTable
        :columns="columns as any"
        :data="tableData"
        :loading="tableLoading"
        :pagination="pagination"
        :row-key="(row: Api.Monitoring.ApiListItem) => `${row.method}:${row.path}`"
        remote
        @update:sorter="handleSorterChange"
      />
    </NCard>
  </div>
</template>
