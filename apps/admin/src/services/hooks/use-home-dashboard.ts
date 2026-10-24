import { useCallback, useEffect, useRef } from "react"
import { useIsFetching, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { dashboardQueryKeys } from "@/services/dashboard-query-keys"
import { openAppSocket, closeAppSocket } from "@/services/app-socket"
import {
  fetchDashboardCapabilities,
  fetchOperationsOverview,
  fetchHealthStats,
  fetchInfrastructureHealth,
  fetchBusinessSummary,
  fetchSystemResources,
  fetchActivities,
  fetchAdminContacts,
  type ActivityPage,
  type SystemResources,
} from "@/services/api/dashboard"
import { fetchApiDistribution, fetchApiTop, fetchApiTrend, type ApiTop } from "@/services/api/api-monitoring"
import {
  selectHomeModules,
  aggregateResources,
  prependActivity,
  resourceEvent,
  activityEvent,
  apiStatsEvent,
  type ActivityFilter,
  type HomeCapability,
} from "@/views/home/modules/home-model"

export const homeKeys = {
  root: (session: number) => dashboardQueryKeys.root(session),
  capabilities: (session: number) => dashboardQueryKeys.capabilities(session),
  resource: (session: number, name: string, params: unknown = null) =>
    ["dashboard", session, "home", name, params] as const,
}
const options = { retry: false, staleTime: 0, gcTime: 0, refetchOnReconnect: false, refetchOnWindowFocus: false }
function requireSession(session: number) {
  if (getAuthSession() !== session || !useAuthStore.getState().token)
    throw Object.assign(new Error("Home identity changed"), { code: "ERR_CANCELED" })
}
function homeAccess(client: QueryClient, session: number, capability: HomeCapability | null) {
  if (getAuthSession() !== session || !useAuthStore.getState().token) return false
  const key = homeKeys.capabilities(session),
    query = client.getQueryState(key)
  const response = client.getQueryData<Awaited<ReturnType<typeof fetchDashboardCapabilities>>>(key)
  if (query?.error || response?.error || !response?.data) return false
  return capability
    ? response.data.allowedModules.includes(capability)
    : selectHomeModules(response.data.allowedModules).length === 0
}
export function useHomeCapabilities() {
  const token = useAuthStore((state) => state.token),
    session = useRef(getAuthSession()).current
  const current = Boolean(token) && session === getAuthSession()
  const query = useQuery({
    ...options,
    refetchOnMount: false,
    queryKey: homeKeys.capabilities(session),
    enabled: current,
    queryFn: async ({ signal }) => {
      requireSession(session)
      const response = await fetchDashboardCapabilities(signal)
      requireSession(session)
      if (response.error) throw response.error
      if (!response.data) throw new Error("Home capabilities are empty")
      return response
    },
  })
  return { ...query, data: current ? query.data : undefined }
}
function useHomeQuery<T>(
  capability: HomeCapability | null,
  name: string,
  load: (signal: AbortSignal) => Promise<{ data: T | null; error: unknown }>,
  params: unknown = null,
) {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    client = useQueryClient()
  const capabilities = useHomeCapabilities()
  const enabled = !capabilities.isError && homeAccess(client, session, capability)
  const query = useQuery({
    ...options,
    queryKey: homeKeys.resource(session, name, params),
    enabled,
    queryFn: async ({ signal }) => {
      const access = client.getQueryCache().find({ queryKey: homeKeys.capabilities(session), exact: true })
      // Paused queries and explicit retries can run while capability refresh is pending.
      while (access && access.state.fetchStatus !== "idle") await access.promise
      if (!homeAccess(client, session, capability)) throw new Error("Home capability or identity changed")
      const response = await load(signal)
      if (!homeAccess(client, session, capability)) throw new Error("Home capability or identity changed")
      if (response.error) throw response.error
      if (response.data === null) throw new Error("Home response is empty")
      return response.data
    },
  })
  return { ...query, data: enabled ? query.data : undefined }
}
export function useHomeOverview() {
  return useHomeQuery("dashboard.overview", "overview", (signal) => fetchOperationsOverview({ range: "7d" }, signal))
}
export function useHomeHealth() {
  return useHomeQuery("dashboard.application-health", "health", fetchHealthStats)
}
export function useHomeBusiness() {
  return useHomeQuery("dashboard.business", "business", fetchBusinessSummary)
}
export function useHomeInfrastructure() {
  return useHomeQuery("dashboard.infrastructure", "infrastructure", fetchInfrastructureHealth)
}
export function useHomeResources() {
  return useHomeQuery("dashboard.infrastructure", "resources", (signal) => fetchSystemResources(undefined, signal))
}
export function useHomeContacts() {
  return useHomeQuery(null, "contacts", fetchAdminContacts)
}
export function useHomeActivities(category: ActivityFilter) {
  return useHomeQuery(
    "dashboard.activity",
    "activity",
    (signal) => fetchActivities({ size: 20, ...(category === "all" ? {} : { categories: [category] }) }, signal),
    category,
  )
}
export function useHomeApi() {
  return {
    distribution: useHomeQuery("dashboard.api-monitoring", "api-distribution", (signal) =>
      fetchApiDistribution({ range: "24h" }, signal),
    ),
    top: useHomeQuery("dashboard.api-monitoring", "api-top", (signal) =>
      fetchApiTop({ range: "24h", sortBy: "errors", limit: 5 }, signal),
    ),
    trend: useHomeQuery("dashboard.api-monitoring", "api-trend", (signal) => fetchApiTrend({ range: "24h" }, signal)),
  }
}
const refreshing = new WeakMap<QueryClient, Map<number, Promise<void>>>()
function refreshHome(client: QueryClient, session: number): Promise<void> {
  const current = () => session === getAuthSession() && Boolean(useAuthStore.getState().token)
  if (!current()) return Promise.resolve()
  let sessions = refreshing.get(client)
  if (!sessions) {
    sessions = new Map()
    refreshing.set(client, sessions)
  }
  const existing = sessions.get(session)
  if (existing) return existing
  const pending = (async () => {
    await client.invalidateQueries(
      { queryKey: homeKeys.capabilities(session), exact: true, type: "active" },
      { cancelRefetch: false },
    )
    if (!current()) return
    await client.invalidateQueries(
      { queryKey: homeKeys.root(session), type: "active", predicate: (query) => query.queryKey[2] === "home" },
      { cancelRefetch: false },
    )
  })().finally(() => {
    sessions.delete(session)
  })
  sessions.set(session, pending)
  return pending
}
export function useHomeRefresh() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    client = useQueryClient()
  return useCallback(() => refreshHome(client, session), [client, session])
}
export function useHomeFetchingCount() {
  useAuthStore((state) => state.token)
  return useIsFetching({ queryKey: homeKeys.root(getAuthSession()) })
}
export function useHomeLive() {
  const capabilities = useHomeCapabilities(),
    client = useQueryClient(),
    session = useRef(getAuthSession()).current
  const isAdmin = useAuthStore((state) => state.userInfo?.isAdmin === true)
  const allowed = capabilities.isError ? [] : (capabilities.data?.data?.allowedModules ?? [])
  const signature = selectHomeModules(allowed).join(",")
  const authenticated = useAuthStore((state) => Boolean(state.token))
  useEffect(() => {
    if (!authenticated || session !== getAuthSession()) return
    const refresh = () => {
      void refreshHome(client, session)
    }
    const visible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("online", refresh)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", visible)
    return () => {
      window.removeEventListener("online", refresh)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [authenticated, client, session])
  useEffect(() => {
    if (!isAdmin || !signature) return
    let active = true,
      connectedOnce = false,
      socket: ReturnType<typeof openAppSocket> | undefined
    const current = (capability: HomeCapability) =>
      active && useAuthStore.getState().userInfo?.isAdmin && homeAccess(client, session, capability)
    function update<T>(key: readonly unknown[], capability: HomeCapability, change: (old: T) => T) {
      if (!current(capability)) return
      const query = client.getQueryCache().find({ queryKey: key, exact: true })
      const pending = query && query.state.fetchStatus !== "idle" ? query.promise : undefined
      const apply = () => {
        if (!current(capability)) return
        client.setQueryData<T>(key, (old) => (old === undefined ? old : change(old)))
      }
      apply()
      if (pending) {
        // Keep reconnect's full snapshot, then replay in-flight events in arrival order.
        void pending.then(apply, () => {})
      } else if (client.getQueryData<T>(key) === undefined) {
        void client.invalidateQueries({ queryKey: key, exact: true })
      }
    }
    const resources = (payload: unknown) => {
      const parsed = resourceEvent.safeParse(payload)
      if (!parsed.success) return
      void update<SystemResources>(homeKeys.resource(session, "resources"), "dashboard.infrastructure", (old) => {
        const instances = [...old.instances.filter((item) => item.hostname !== parsed.data.hostname), parsed.data]
        return { instances, summary: aggregateResources(instances) }
      })
    }
    const activity = (payload: unknown) => {
      const parsed = activityEvent.safeParse(payload)
      if (!parsed.success) return
      for (const query of client
        .getQueryCache()
        .findAll({ queryKey: [...homeKeys.root(session), "home", "activity"] })) {
        const category = query.queryKey[4]
        if (!["all", "task", "user", "system", "alert"].some((value) => value === category)) continue
        // Reuse the filter's typed comparison rather than trusting arbitrary cache-key values.
        const accepted = category === "all" || category === parsed.data.category
        if (!accepted) continue
        void update<ActivityPage>(query.queryKey, "dashboard.activity", (old) => ({
          ...old,
          items: prependActivity(old.items, parsed.data, parsed.data.category),
        }))
      }
    }
    const api = (payload: unknown) => {
      const parsed = apiStatsEvent.safeParse(payload)
      if (!parsed.success || parsed.data.topFailures === undefined) return
      const rows = parsed.data.topFailures
      void update<ApiTop>(homeKeys.resource(session, "api-top"), "dashboard.api-monitoring", () => rows)
    }
    const connected = () => {
      if (!active || session !== getAuthSession()) return
      if (!connectedOnce) {
        connectedOnce = true
        return
      }
      void refreshHome(client, session)
    }
    queueMicrotask(() => {
      if (!active || session !== getAuthSession() || !useAuthStore.getState().userInfo?.isAdmin) return
      socket = openAppSocket("/dashboard")
      connectedOnce = socket.connected
      socket.on("dashboard:resources", resources)
      socket.on("dashboard:activity.created", activity)
      socket.on("dashboard:api_stats", api)
      socket.on("connect", connected)
    })
    return () => {
      active = false
      socket?.off("dashboard:resources", resources)
      socket?.off("dashboard:activity.created", activity)
      socket?.off("dashboard:api_stats", api)
      socket?.off("connect", connected)
      if (socket) closeAppSocket(socket)
    }
  }, [client, isAdmin, session, signature])
}
