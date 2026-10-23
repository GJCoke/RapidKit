import { useEffect, useLayoutEffect, useRef } from "react"
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { openAppSocket, closeAppSocket } from "@/services/app-socket"
import {
  fetchApiOverview,
  fetchApiDistribution,
  fetchApiTrend,
  fetchApiTop,
  fetchApiList,
  type ApiList,
  type ApiListQuery,
  type ApiOverview,
} from "@/services/api/api-monitoring"
import {
  applyApiStats,
  parseApiStats,
  type ApiStatsEvent,
  type MonitoringRange,
  type MonitoringMethod,
} from "@/views/monitoring/api/modules/monitoring-model"
export const apiMonitoringKeys = {
  all: (session: number) => ["api-monitoring", session] as const,
  range: (session: number, range: MonitoringRange) => ["api-monitoring", session, range] as const,
}
export function monitoringAccess(session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, "monitoring:read")
}
function requireMonitoring(session: number, signal?: AbortSignal) {
  if (!monitoringAccess(session) || signal?.aborted) throw new Error("API monitoring session or permission changed")
}
async function monitoringData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("API monitoring response is empty")
  return result.data
}
const options = { retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false }
function useMonitoringQuery<T>(
  key: QueryKey,
  session: number,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
) {
  return useQuery({
    ...options,
    queryKey: key,
    enabled,
    queryFn: ({ signal }) => {
      requireMonitoring(session, signal)
      return load(signal)
    },
  })
}
async function monitoringList(
  query: ApiListQuery,
  method: MonitoringMethod | null,
  session: number,
  signal: AbortSignal,
): Promise<ApiList> {
  requireMonitoring(session, signal)
  if (!method) return monitoringData(fetchApiList(query, signal))
  // The current API has no method filter. Read all matching pages before filtering/paginating locally.
  const first = await monitoringData(fetchApiList({ ...query, page: 1, pageSize: 500 }, signal)),
    records = [...first.records]
  for (let page = 2; page <= Math.ceil(first.total / 500); page++) {
    requireMonitoring(session, signal)
    const next = await monitoringData(fetchApiList({ ...query, page, pageSize: 500 }, signal))
    if (!next.records.length) throw new Error("API monitoring list changed while reading all pages")
    records.push(...next.records)
  }
  requireMonitoring(session, signal)
  const unique = new Map(records.map((record) => [`${record.method}:${record.path}`, record])),
    filtered = [...unique.values()].filter((record) => record.method === method)
  return { records: filtered, total: filtered.length, page: 1, pageSize: 500 }
}
export function useApiMonitoring(range: MonitoringRange, query: ApiListQuery, method: MonitoringMethod | null) {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    read = usePermission("monitoring:read") && session === getAuthSession(),
    admin = useAuthStore((state) => state.userInfo?.isAdmin === true),
    client = useQueryClient(),
    root = apiMonitoringKeys.range(session, range),
    overviewKey = [...root, "overview"],
    activeOverview = useRef(overviewKey),
    buffers = useRef(new Map<string, ApiStatsEvent[]>())
  useLayoutEffect(() => {
    activeOverview.current = overviewKey
  })
  const overview = useMonitoringQuery(overviewKey, session, read, async (signal) => {
      const key = JSON.stringify(overviewKey),
        events: ApiStatsEvent[] = []
      buffers.current.set(key, events)
      try {
        const snapshot = await monitoringData(fetchApiOverview({ range }, signal))
        requireMonitoring(session, signal)
        return events.reduce(applyApiStats, snapshot)
      } finally {
        if (buffers.current.get(key) === events) buffers.current.delete(key)
      }
    }),
    distribution = useMonitoringQuery([...root, "distribution"], session, read, (signal) =>
      monitoringData(fetchApiDistribution({ range }, signal)),
    ),
    trend = useMonitoringQuery([...root, "trend"], session, read, (signal) =>
      monitoringData(fetchApiTrend({ range }, signal)),
    ),
    topRequests = useMonitoringQuery([...root, "top-requests"], session, read, (signal) =>
      monitoringData(fetchApiTop({ range, sortBy: "requests", limit: 10 }, signal)),
    ),
    topP95 = useMonitoringQuery([...root, "top-p95"], session, read, (signal) =>
      monitoringData(fetchApiTop({ range, sortBy: "p95_ms", limit: 10 }, signal)),
    ),
    dataset = { ...query, page: undefined, pageSize: undefined },
    list = useMonitoringQuery([...root, "list", method ? { ...dataset, method } : query], session, read, (signal) =>
      monitoringList(query, method, session, signal),
    ),
    page = query.page ?? 1,
    pageSize = query.pageSize ?? 20,
    listData = read ? list.data : undefined,
    records = listData
      ? method
        ? listData.records.slice((page - 1) * pageSize, page * pageSize)
        : listData.records
      : []
  useEffect(() => {
    if (!read || !admin) return
    let active = true,
      socket: ReturnType<typeof openAppSocket> | undefined
    const current = () => active && monitoringAccess(session) && useAuthStore.getState().userInfo?.isAdmin === true
    const stats = (payload: unknown) => {
      if (!current()) return
      const event = parseApiStats(payload)
      if (!event) return
      const key = activeOverview.current,
        previous = client.getQueryData<ApiOverview>(key)
      if (previous) {
        void client.cancelQueries({ queryKey: key, exact: true })
        client.setQueryData<ApiOverview>(key, applyApiStats(previous, event))
      } else buffers.current.get(JSON.stringify(key))?.push(event)
    }
    queueMicrotask(() => {
      if (!current()) return
      socket = openAppSocket("/dashboard")
      socket.on("dashboard:api_stats", stats)
    })
    return () => {
      active = false
      socket?.off("dashboard:api_stats", stats)
      if (socket) closeAppSocket(socket)
    }
  }, [read, admin, client, session])
  async function refresh(includeList = true) {
    if (!monitoringAccess(session)) return
    await Promise.allSettled([
      overview.refetch(),
      distribution.refetch(),
      trend.refetch(),
      topRequests.refetch(),
      topP95.refetch(),
      ...(includeList ? [list.refetch()] : []),
    ])
  }
  return {
    loading: read && [overview, distribution, trend, topRequests, topP95, list].some((resource) => resource.isFetching),
    overview: read ? overview.data : undefined,
    distribution: read ? distribution.data : undefined,
    trend: read ? trend.data : undefined,
    topRequests: read ? topRequests.data : undefined,
    topP95: read ? topP95.data : undefined,
    records,
    total: listData?.total ?? 0,
    queries: { overview, distribution, trend, topRequests, topP95, list },
    refresh,
  }
}
