import { computed, reactive, ref } from "vue"
import dayjs from "dayjs"
import { useSocket } from "@/hooks/common/socket"
import {
  fetchActivities,
  fetchApiDistribution,
  fetchApiTop,
  fetchApiTrend,
  fetchBusinessSummary,
  fetchErrorStats,
  fetchHealthStats,
  fetchInfrastructureHealth,
  fetchGetOperationsOverview,
  fetchSystemResources,
  fetchUserActivityTrend,
  fetchUserStatsSummary,
  fetchGetAllWorkers,
  fetchTaskStatsSummary,
} from "@/service/api"

export function useDashboard() {
  const operationsOverview = ref<Api.Dashboard.OperationsOverview | null>(null)
  const operationsRange = ref<"7d" | "30d" | "custom">("7d")
  const operationsError = ref(false)
  const operationsLoading = ref(false)
  let operationsRequestId = 0
  // ==================== Reactive State ====================
  const userSummary = ref<Api.Dashboard.UserStatsSummary>({
    total: 0,
    todayNew: 0,
    yesterdayNew: 0,
    onlineCount: 0,
  })

  const onlineUsers = ref(0)
  const workerCount = ref(0)
  const onlineWorkerSet = new Set<string>()

  const taskSummary = ref<Api.Worker.TaskStatsSummary>({
    total: 0,
    success: 0,
    failure: 0,
    retry: 0,
    revoked: 0,
    successRate: 0,
    avgRuntime: null,
  })

  const errorStats = ref<Api.Dashboard.ErrorStats>({
    http5XxCount: 0,
    bizErrorCount: 0,
    totalRequests: 0,
    errorRate: 0,
    sparkline24H: [],
  })

  const healthStats = ref<Api.Dashboard.HealthStats>({
    qps: 0,
    p50Ms: 0,
    p95Ms: 0,
    http5Xx1H: 0,
    bizErrors1H: 0,
    wsConnections: 0,
  })

  const infrastructure = ref<Api.Dashboard.InfrastructureHealth>({
    pg: { status: "down", latencyMs: 0, details: null },
    redis: { status: "down", latencyMs: 0, details: null },
    minio: { status: "down", latencyMs: 0, details: null },
  })

  const businessSummary = ref<Api.Dashboard.BusinessSummary>({
    roles: 0,
    menus: 0,
    routers: 0,
    scripts: 0,
    schedules: 0,
  })

  const instanceResources = ref<Map<string, Api.Dashboard.InstanceResourceStats>>(new Map())
  const selectedInstance = ref<string>("summary")

  const resources = computed<Api.Dashboard.ResourceStats>(() => {
    const sel = selectedInstance.value
    if (sel !== "summary") {
      const inst = instanceResources.value.get(sel)
      if (inst) return inst
    }
    // Aggregate summary
    const instances = Array.from(instanceResources.value.values())
    if (!instances.length) {
      return {
        cpuPercent: 0,
        memoryUsed: 0,
        memoryTotal: 0,
        memoryPercent: 0,
        diskUsed: 0,
        diskTotal: 0,
        diskPercent: 0,
        netSent: 0,
        netRecv: 0,
      }
    }
    // 单实例时直接返回，避免不必要的聚合
    if (instances.length === 1) return instances[0]
    const n = instances.length
    const totalMem = instances.reduce((s, i) => s + i.memoryTotal, 0)
    const totalDisk = instances.reduce((s, i) => s + i.diskTotal, 0)
    return {
      cpuPercent: Math.round((instances.reduce((s, i) => s + i.cpuPercent, 0) / n) * 10) / 10,
      memoryUsed: instances.reduce((s, i) => s + i.memoryUsed, 0),
      memoryTotal: totalMem,
      memoryPercent: totalMem
        ? Math.round((instances.reduce((s, i) => s + i.memoryUsed, 0) / totalMem) * 1000) / 10
        : 0,
      diskUsed: instances.reduce((s, i) => s + i.diskUsed, 0),
      diskTotal: totalDisk,
      diskPercent: totalDisk ? Math.round((instances.reduce((s, i) => s + i.diskUsed, 0) / totalDisk) * 1000) / 10 : 0,
      netSent: instances.reduce((s, i) => s + i.netSent, 0),
      netRecv: instances.reduce((s, i) => s + i.netRecv, 0),
    }
  })

  const activities = ref<Api.Dashboard.ActivityItem[]>([])
  const activityCategory = ref<"all" | Api.Dashboard.ActivityCategory>("all")

  // API Monitoring data
  const apiDistribution = ref<Api.Monitoring.ApiDistributionItem[]>([])
  const apiTopFailures = ref<Api.Monitoring.ApiTopItem[]>([])
  const apiTrend = ref<Api.Monitoring.ApiTrendPoint[]>([])

  // Trend data
  const userTrend = ref<Api.Dashboard.UserActivityTrend[]>([])
  const taskTrend = ref<Api.Dashboard.UserActivityTrend[]>([])
  // Time range
  const trendRange = ref<"today" | "7d" | "30d" | "custom">("30d")
  const customRange = ref<[number, number] | null>(null)

  // Loading states
  const loading = reactive({
    initial: false,
    userTrend: false,
    taskTrend: false,
  })

  // ==================== Data Loaders ====================

  async function loadModules(moduleKeys: readonly string[]) {
    loading.initial = true
    const loaders: Record<string, () => Promise<unknown>> = {
      "dashboard.overview": loadOperationsOverview,
      "dashboard.application-health": loadHealthStats,
      "dashboard.infrastructure": () => Promise.all([loadInfrastructure(), loadResources()]),
      "dashboard.business": loadBusinessSummary,
      "dashboard.api-monitoring": () => Promise.all([loadApiDistribution(), loadApiTopFailures(), loadApiTrend()]),
      "dashboard.trends": loadUserTrend,
      "dashboard.activity": loadActivities,
    }
    const results = await Promise.allSettled(
      moduleKeys.map((key) => loaders[key]?.()).filter((result): result is Promise<unknown> => Boolean(result)),
    )
    void results
    loading.initial = false
  }

  async function loadOperationsOverview(custom?: [number, number]) {
    const requestId = ++operationsRequestId
    operationsLoading.value = true
    operationsError.value = false
    const params: Api.Dashboard.OperationsOverviewQuery = { range: operationsRange.value }
    if (operationsRange.value === "custom" && custom) {
      params.start = dayjs(custom[0]).format("YYYY-MM-DD")
      params.end = dayjs(custom[1]).format("YYYY-MM-DD")
    }
    const { data, error } = await fetchGetOperationsOverview(params)
    if (requestId !== operationsRequestId) return
    if (error) {
      operationsError.value = true
    } else {
      operationsOverview.value = data
    }
    operationsLoading.value = false
  }

  async function onOperationsRangeChange(range: "7d" | "30d" | "custom", custom?: [number, number]) {
    operationsRange.value = range
    await loadOperationsOverview(custom)
  }

  async function loadUserSummary() {
    const { data, error } = await fetchUserStatsSummary()
    if (!error) {
      userSummary.value = data
      onlineUsers.value = data.onlineCount
    }
  }

  async function loadTaskSummary() {
    const { data, error } = await fetchTaskStatsSummary({ days: 1 })
    if (!error) {
      taskSummary.value = data
    }
  }

  async function loadErrorStats() {
    const { data, error } = await fetchErrorStats()
    if (!error) {
      errorStats.value = data
    }
  }

  async function loadHealthStats() {
    const { data, error } = await fetchHealthStats()
    if (!error) {
      healthStats.value = data
    }
  }

  async function loadInfrastructure() {
    const { data, error } = await fetchInfrastructureHealth()
    if (!error) {
      infrastructure.value = data
    }
  }

  async function loadBusinessSummary() {
    const { data, error } = await fetchBusinessSummary()
    if (!error) {
      businessSummary.value = data
    }
  }

  async function loadResources() {
    const { data, error } = await fetchSystemResources()
    if (!error) {
      const map = new Map<string, Api.Dashboard.InstanceResourceStats>()
      for (const inst of data.instances) {
        map.set(inst.hostname, inst)
      }
      instanceResources.value = map
    }
  }

  async function loadWorkers() {
    const { data, error } = await fetchGetAllWorkers()
    if (!error) {
      onlineWorkerSet.clear()
      data.filter((w) => w.status === "1").forEach((w) => onlineWorkerSet.add(w.hostname))
      workerCount.value = onlineWorkerSet.size
    }
  }

  async function loadActivities() {
    const categories = activityCategory.value === "all" ? undefined : [activityCategory.value]
    const { data, error } = await fetchActivities({ categories, size: 20 })
    if (!error) {
      activities.value = data.items
    }
  }

  function onActivityCategoryChange(category: "all" | Api.Dashboard.ActivityCategory) {
    activityCategory.value = category
    void loadActivities()
  }

  async function loadApiDistribution() {
    const { data, error } = await fetchApiDistribution({ range: "24h" })
    if (!error) apiDistribution.value = data
  }

  async function loadApiTopFailures() {
    const { data, error } = await fetchApiTop({ range: "24h", sortBy: "errors", limit: 5 })
    if (!error) apiTopFailures.value = data
  }

  async function loadApiTrend() {
    const { data, error } = await fetchApiTrend({ range: "24h" })
    if (!error) apiTrend.value = data
  }

  function getTrendParams() {
    const now = dayjs()
    let start: string
    let end: string
    let granularity: string

    if (trendRange.value === "custom" && customRange.value) {
      start = dayjs(customRange.value[0]).format("YYYY-MM-DD")
      end = dayjs(customRange.value[1]).format("YYYY-MM-DD")
      const diffDays = dayjs(customRange.value[1]).diff(dayjs(customRange.value[0]), "day")
      granularity = diffDays <= 1 ? "hour" : "day"
    } else if (trendRange.value === "7d") {
      start = now.subtract(6, "day").format("YYYY-MM-DD")
      end = now.format("YYYY-MM-DD")
      granularity = "day"
    } else if (trendRange.value === "30d") {
      start = now.subtract(29, "day").format("YYYY-MM-DD")
      end = now.format("YYYY-MM-DD")
      granularity = "day"
    } else {
      // today
      start = now.format("YYYY-MM-DD")
      end = now.format("YYYY-MM-DD")
      granularity = "hour"
    }

    return { start, end, granularity }
  }

  async function loadUserTrend() {
    loading.userTrend = true
    const params = getTrendParams()
    const { data, error } = await fetchUserActivityTrend(params)
    if (!error) {
      userTrend.value = data
    }
    loading.userTrend = false
  }

  async function loadTaskTrend() {
    loading.taskTrend = true
    // TODO: implement when backend task trend API is ready
    taskTrend.value = []
    loading.taskTrend = false
  }

  async function onTrendRangeChange(range: "today" | "7d" | "30d" | "custom", custom?: [number, number]) {
    trendRange.value = range
    if (custom) customRange.value = custom
    await loadUserTrend()
  }

  // ==================== Socket.IO ====================

  const { socket, connect, isConnected } = useSocket()

  function setupSocket(moduleKeys: readonly string[]) {
    const enabled = new Set(moduleKeys)
    const baseUrl = new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin

    connect({
      url: baseUrl,
      namespace: "/dashboard",
      path: "/socket.io",
    })

    if (enabled.has("dashboard.overview"))
      socket.value?.on("dashboard:online_users", (data: Api.Dashboard.OnlineUsersEvent) => {
        onlineUsers.value = data.count
        userSummary.value = { ...userSummary.value, onlineCount: data.count }
      })

    if (enabled.has("dashboard.overview"))
      socket.value?.on("dashboard:worker_status", (data: Api.Dashboard.DashboardWorkerStatusEvent) => {
        if (data.status === "1") {
          onlineWorkerSet.add(data.hostname)
        } else {
          onlineWorkerSet.delete(data.hostname)
        }
        workerCount.value = onlineWorkerSet.size
      })

    if (enabled.has("dashboard.overview"))
      socket.value?.on("dashboard:task_completed", (data: Api.Dashboard.TaskCompletedEvent) => {
        // Update today's task summary
        taskSummary.value = {
          ...taskSummary.value,
          total: taskSummary.value.total + 1,
          success: data.status === "3" ? taskSummary.value.success + 1 : taskSummary.value.success,
          failure: data.status === "4" ? taskSummary.value.failure + 1 : taskSummary.value.failure,
        }
      })

    if (enabled.has("dashboard.overview"))
      socket.value?.on("dashboard:error_stats", (data: Api.Dashboard.ErrorStatsEvent) => {
        errorStats.value = {
          ...errorStats.value,
          http5XxCount: data.http5xxCount,
          bizErrorCount: data.bizErrorCount,
          totalRequests: Math.max(errorStats.value.totalRequests, data.totalRequests),
          errorRate: data.errorRate,
        }
      })

    if (enabled.has("dashboard.infrastructure"))
      socket.value?.on("dashboard:resources", (data: Api.Dashboard.ResourcesEvent) => {
        const map = new Map(instanceResources.value)
        map.set(data.hostname, data)
        instanceResources.value = map
      })

    if (enabled.has("dashboard.activity"))
      socket.value?.on("dashboard:activity.created", (data: Api.Dashboard.ActivityCreatedEvent) => {
        if (activityCategory.value !== "all" && activityCategory.value !== data.category) return
        if (activities.value.some((item) => item.id === data.id)) return
        activities.value = [data, ...activities.value.slice(0, 19)]
      })

    if (enabled.has("dashboard.api-monitoring"))
      socket.value?.on("dashboard:api_stats", (data: Api.Monitoring.ApiStatsEvent) => {
        if (data.topFailures?.length) {
          apiTopFailures.value = data.topFailures
        }
      })
  }

  return {
    // State
    userSummary,
    operationsOverview,
    operationsRange,
    operationsError,
    operationsLoading,
    onlineUsers,
    workerCount,
    taskSummary,
    errorStats,
    healthStats,
    infrastructure,
    businessSummary,
    resources,
    instanceResources,
    selectedInstance,
    activities,
    activityCategory,
    userTrend,
    trendRange,
    customRange,
    apiDistribution,
    apiTopFailures,
    apiTrend,
    loading,
    isConnected,

    // Actions
    loadModules,
    loadOperationsOverview,
    onOperationsRangeChange,
    setupSocket,
    onTrendRangeChange,
    loadUserTrend,
    onActivityCategoryChange,
  }
}
