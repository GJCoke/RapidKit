import { computed, ref } from "vue"
import dayjs from "dayjs"
import { useAppSocket } from "@/hooks/common/app-socket"
import { useAuthStore } from "@/store/modules/auth"
import {
  fetchActivities,
  fetchApiDistribution,
  fetchApiTop,
  fetchApiTrend,
  fetchBusinessSummary,
  fetchHealthStats,
  fetchInfrastructureHealth,
  fetchGetOperationsOverview,
  fetchSystemResources,
} from "@/service/api"

export function useDashboard() {
  const operationsOverview = ref<Api.Dashboard.OperationsOverview | null>(null)
  const operationsRange = ref<"7d" | "30d" | "custom">("7d")
  const operationsError = ref(false)
  const operationsLoading = ref(false)
  let operationsRequestId = 0
  // ==================== Reactive State ====================
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

  // ==================== Data Loaders ====================

  async function loadModules(moduleKeys: readonly string[]) {
    const loaders: Record<string, () => Promise<unknown>> = {
      "dashboard.overview": loadOperationsOverview,
      "dashboard.application-health": loadHealthStats,
      "dashboard.infrastructure": () => Promise.all([loadInfrastructure(), loadResources()]),
      "dashboard.business": loadBusinessSummary,
      "dashboard.api-monitoring": () => Promise.all([loadApiDistribution(), loadApiTopFailures(), loadApiTrend()]),
      "dashboard.activity": loadActivities,
    }
    await Promise.allSettled(
      moduleKeys.map((key) => loaders[key]?.()).filter((result): result is Promise<unknown> => Boolean(result)),
    )
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

  // ==================== Socket.IO ====================

  const { on, connect, isConnected } = useAppSocket()

  function setupSocket(moduleKeys: readonly string[]) {
    const enabled = new Set(moduleKeys)
    if (!useAuthStore().userInfo.isAdmin) return
    connect("/dashboard")

    if (enabled.has("dashboard.infrastructure"))
      on("dashboard:resources", (data: Api.Dashboard.ResourcesEvent) => {
        const map = new Map(instanceResources.value)
        map.set(data.hostname, data)
        instanceResources.value = map
      })

    if (enabled.has("dashboard.activity"))
      on("dashboard:activity.created", (data: Api.Dashboard.ActivityCreatedEvent) => {
        if (activityCategory.value !== "all" && activityCategory.value !== data.category) return
        if (activities.value.some((item) => item.id === data.id)) return
        activities.value = [data, ...activities.value.slice(0, 19)]
      })

    if (enabled.has("dashboard.api-monitoring"))
      on("dashboard:api_stats", (data: Api.Monitoring.ApiStatsEvent) => {
        if (data.topFailures?.length) {
          apiTopFailures.value = data.topFailures
        }
      })
  }

  return {
    // State
    operationsOverview,
    operationsRange,
    operationsError,
    operationsLoading,
    healthStats,
    infrastructure,
    businessSummary,
    resources,
    instanceResources,
    selectedInstance,
    activities,
    activityCategory,
    apiDistribution,
    apiTopFailures,
    apiTrend,
    isConnected,

    // Actions
    loadModules,
    loadOperationsOverview,
    onOperationsRangeChange,
    setupSocket,
    onActivityCategoryChange,
  }
}
