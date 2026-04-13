import { reactive, ref } from "vue"
import { useSocket } from "@/hooks/common/socket"
import { fetchApiOverview, fetchApiTop, fetchApiDistribution, fetchApiTrend } from "@/service/api"

export function useMonitoring() {
  // ==================== Reactive State ====================

  const timeRange = ref<Api.Monitoring.TimeRange>("24h")

  const overview = ref<Api.Monitoring.ApiOverview>({
    totalRequests: 0,
    totalErrors: 0,
    avgErrorRate: 0,
    avgMs: 0,
    busiestPath: null,
    busiestMethod: null,
    busiestCount: 0,
  })

  const distribution = ref<Api.Monitoring.ApiDistributionItem[]>([])
  const topRequests = ref<Api.Monitoring.ApiTopItem[]>([])
  const topP95 = ref<Api.Monitoring.ApiTopItem[]>([])
  const trend = ref<Api.Monitoring.ApiTrendPoint[]>([])

  const loading = reactive({
    initial: false,
    overview: false,
    distribution: false,
    topRequests: false,
    topP95: false,
    trend: false,
  })

  // ==================== Data Loaders ====================

  function rangeParams() {
    return { range: timeRange.value }
  }

  async function loadInitialData() {
    loading.initial = true
    await Promise.allSettled([loadOverview(), loadDistribution(), loadTopRequests(), loadTopP95(), loadTrend()])
    loading.initial = false
  }

  async function loadOverview() {
    loading.overview = true
    const { data, error } = await fetchApiOverview(rangeParams())
    if (!error) overview.value = data
    loading.overview = false
  }

  async function loadDistribution() {
    loading.distribution = true
    const { data, error } = await fetchApiDistribution(rangeParams())
    if (!error) distribution.value = data
    loading.distribution = false
  }

  async function loadTopRequests() {
    loading.topRequests = true
    const { data, error } = await fetchApiTop({ ...rangeParams(), sortBy: "requests", limit: 10 })
    if (!error) topRequests.value = data
    loading.topRequests = false
  }

  async function loadTopP95() {
    loading.topP95 = true
    const { data, error } = await fetchApiTop({ ...rangeParams(), sortBy: "p95_ms", limit: 10 })
    if (!error) topP95.value = data
    loading.topP95 = false
  }

  async function loadTrend() {
    loading.trend = true
    const { data, error } = await fetchApiTrend(rangeParams())
    if (!error) trend.value = data
    loading.trend = false
  }

  async function onTimeRangeChange(range: Api.Monitoring.TimeRange) {
    timeRange.value = range
    await loadInitialData()
  }

  // ==================== Socket.IO ====================

  const { socket, connect, isConnected } = useSocket()

  function setupSocket() {
    const baseUrl = new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin

    connect({
      url: baseUrl,
      namespace: "/dashboard",
      path: "/socket.io",
    })

    socket.value?.on("dashboard:api_stats", (data: Api.Monitoring.ApiStatsEvent) => {
      overview.value = {
        ...overview.value,
        totalRequests: overview.value.totalRequests + data.deltaRequests,
        totalErrors: overview.value.totalErrors + data.deltaErrors,
        avgErrorRate: data.errorRate,
      }
    })
  }

  return {
    // State
    timeRange,
    overview,
    distribution,
    topRequests,
    topP95,
    trend,
    loading,
    isConnected,

    // Actions
    loadInitialData,
    setupSocket,
    onTimeRangeChange,
  }
}
