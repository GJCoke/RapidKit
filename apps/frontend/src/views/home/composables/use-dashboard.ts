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
  fetchSystemResources,
  fetchUserActivityTrend,
  fetchUserStatsSummary,
  fetchGetAllWorkers,
  fetchGetAuditDictList,
  fetchTaskStatsSummary,
} from "@/service/api"

export function useDashboard() {
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
    http5xxCount: 0,
    bizErrorCount: 0,
    totalRequests: 0,
    errorRate: 0,
    sparkline24h: [],
  })

  const healthStats = ref<Api.Dashboard.HealthStats>({
    qps: 0,
    p50Ms: 0,
    p95Ms: 0,
    http5xx1h: 0,
    bizErrors1h: 0,
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

  const auditDict = ref<{
    resource: Record<string, { zh: string; en: string }>
    action: Record<string, { zh: string; en: string }>
  }>({ resource: {}, action: {} })

  // API Monitoring data
  const apiDistribution = ref<Api.Monitoring.ApiDistributionItem[]>([])
  const apiTopFailures = ref<Api.Monitoring.ApiTopItem[]>([])
  const apiTrend = ref<Api.Monitoring.ApiTrendPoint[]>([])

  // Trend data
  const userTrend = ref<Api.Dashboard.UserActivityTrend[]>([])
  const taskTrend = ref<Api.Dashboard.UserActivityTrend[]>([])
  // Time range
  const trendRange = ref<"today" | "7d" | "30d" | "custom">("today")
  const customRange = ref<[number, number] | null>(null)

  // Loading states
  const loading = reactive({
    initial: false,
    userTrend: false,
    taskTrend: false,
  })

  // ==================== Data Loaders ====================

  async function loadInitialData() {
    loading.initial = true
    const results = await Promise.allSettled([
      loadUserSummary(),
      loadTaskSummary(),
      loadErrorStats(),
      loadHealthStats(),
      loadInfrastructure(),
      loadBusinessSummary(),
      loadResources(),
      loadWorkers(),
      loadActivities(),
      loadAuditDict(),
      loadUserTrend(),
      loadApiDistribution(),
      loadApiTopFailures(),
      loadApiTrend(),
    ])
    void results
    loading.initial = false
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
    const { data, error } = await fetchActivities()
    if (!error) {
      activities.value = data
    }
  }

  async function loadAuditDict() {
    const { data, error } = await fetchGetAuditDictList()
    if (!error) {
      const resource: Record<string, { zh: string; en: string }> = {}
      const action: Record<string, { zh: string; en: string }> = {}
      for (const item of data) {
        const entry = { zh: item.labelZh, en: item.labelEn }
        if (item.category === "resource") resource[item.key] = entry
        else if (item.category === "action") action[item.key] = entry
      }
      auditDict.value = { resource, action }
    }
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

  function setupSocket() {
    const baseUrl = new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin

    connect({
      url: baseUrl,
      namespace: "/dashboard",
      path: "/socket.io",
    })

    socket.value?.on("dashboard:online_users", (data: Api.Dashboard.OnlineUsersEvent) => {
      onlineUsers.value = data.count
      userSummary.value = { ...userSummary.value, onlineCount: data.count }
    })

    socket.value?.on("dashboard:worker_status", (data: Api.Dashboard.DashboardWorkerStatusEvent) => {
      if (data.status === "1") {
        onlineWorkerSet.add(data.hostname)
      } else {
        onlineWorkerSet.delete(data.hostname)
      }
      workerCount.value = onlineWorkerSet.size
    })

    socket.value?.on("dashboard:task_completed", (data: Api.Dashboard.TaskCompletedEvent) => {
      // Update today's task summary
      taskSummary.value = {
        ...taskSummary.value,
        total: taskSummary.value.total + 1,
        success: data.status === "3" ? taskSummary.value.success + 1 : taskSummary.value.success,
        failure: data.status === "4" ? taskSummary.value.failure + 1 : taskSummary.value.failure,
      }
    })

    socket.value?.on("dashboard:error_stats", (data: Api.Dashboard.ErrorStatsEvent) => {
      errorStats.value = {
        ...errorStats.value,
        http5xxCount: data.http5xxCount,
        bizErrorCount: data.bizErrorCount,
        totalRequests: Math.max(errorStats.value.totalRequests, data.totalRequests),
        errorRate: data.errorRate,
      }
    })

    socket.value?.on("dashboard:resources", (data: Api.Dashboard.ResourcesEvent) => {
      const map = new Map(instanceResources.value)
      map.set(data.hostname, data)
      instanceResources.value = map
    })

    socket.value?.on("dashboard:activity", (data: Api.Dashboard.ActivityEvent) => {
      activities.value = [data, ...activities.value.slice(0, 14)]
    })

    socket.value?.on("dashboard:api_stats", (data: Api.Monitoring.ApiStatsEvent) => {
      if (data.topFailures?.length) {
        apiTopFailures.value = data.topFailures
      }
    })
  }

  return {
    // State
    userSummary,
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
    auditDict,
    userTrend,
    trendRange,
    customRange,
    apiDistribution,
    apiTopFailures,
    apiTrend,
    loading,
    isConnected,

    // Actions
    loadInitialData,
    setupSocket,
    onTrendRangeChange,
    loadUserTrend,
  }
}
