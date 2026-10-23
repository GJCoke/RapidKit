import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { openAppSocket, closeAppSocket } from "@/services/app-socket"
import type { PermissionCode } from "@/typings/permission-codes"
import {
  fetchWorkers,
  fetchQueueOverview,
  fetchTaskRanking,
  fetchWorkerRanking,
  type WorkerList,
} from "@/services/api/worker"
import { normalizeWorker, workerStatusEvent } from "@/views/queue/dashboard/modules/queue-model"
export const queueKeys = {
  all: (session: number) => ["queue", session] as const,
  workers: (session: number) => ["queue", session, "workers"] as const,
  stats: (session: number) => ["queue", session, "stats"] as const,
  worker: (session: number, id: string) => ["queue", session, "worker", id] as const,
}
export function queueAccess(code: PermissionCode, session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, code)
}
export function requireQueuePermission(code: PermissionCode, session: number) {
  if (!queueAccess(code, session)) throw new Error("Queue operation permission or session changed")
}
export async function queueData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Queue response is empty")
  return result.data
}
export function useQueueDashboard() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    client = useQueryClient(),
    read = usePermission("worker:read"),
    stats = usePermission("task:stats"),
    canRead = read && session === getAuthSession(),
    canReadStats = canRead && stats
  const [days, setDays] = useState(1),
    [connected, setConnected] = useState(false),
    [now, setNow] = useState(Date.now)
  const options = { retry: false, staleTime: 0, refetchInterval: 30000, refetchIntervalInBackground: true }
  const workersQuery = useQuery({
    ...options,
    queryKey: queueKeys.workers(session),
    queryFn: () => {
      requireQueuePermission("worker:read", session)
      return queueData(fetchWorkers())
    },
    enabled: canRead,
  })
  const overviewQuery = useQuery({
    ...options,
    gcTime: 0,
    queryKey: [...queueKeys.stats(session), "overview", days],
    queryFn: () => {
      requireQueuePermission("worker:read", session)
      return queueData(fetchQueueOverview({ days }))
    },
    enabled: canRead,
  })
  const taskQuery = useQuery({
    ...options,
    gcTime: 0,
    queryKey: [...queueKeys.stats(session), "tasks", days],
    queryFn: () => {
      requireQueuePermission("task:stats", session)
      const end = Date.now()
      return queueData(
        fetchTaskRanking({
          startTime: new Date(end - days * 86400000).toISOString(),
          endTime: new Date(end).toISOString(),
          page: 1,
          pageSize: 10,
          sortBy: "total",
          sortOrder: "desc",
        }),
      )
    },
    enabled: canReadStats,
  })
  const workerQuery = useQuery({
    ...options,
    gcTime: 0,
    queryKey: [...queueKeys.stats(session), "workers", days],
    queryFn: () => {
      requireQueuePermission("task:stats", session)
      return queueData(fetchWorkerRanking({ days }))
    },
    enabled: canReadStats,
  })
  useEffect(() => {
    const inactive = {
      queryKey: queueKeys.stats(session),
      predicate: (query: { getObserversCount: () => number }) => query.getObserversCount() === 0,
    }
    void client.cancelQueries(inactive)
    client.removeQueries(inactive)
  }, [client, session, days])
  useEffect(() => {
    if (!canRead) return
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [canRead])
  useEffect(() => {
    if (!canRead) {
      setConnected(false)
      return
    }
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined,
      flushing = false,
      dirty = false
    let socket: ReturnType<typeof openAppSocket> | undefined
    const current = () => active && queueAccess("worker:read", session)
    const schedule = () => {
      dirty = true
      if (timer || flushing) return
      timer = setTimeout(async () => {
        timer = undefined
        flushing = true
        const pending = client
          .getQueryCache()
          .findAll({ queryKey: queueKeys.stats(session), type: "active" })
          .filter((query) => query.state.fetchStatus === "fetching")
          .map((query) => query.promise)
        await Promise.allSettled(pending)
        if (!current()) {
          flushing = false
          return
        }
        dirty = false
        await client.invalidateQueries({ queryKey: queueKeys.stats(session) })
        flushing = false
        if (dirty && current()) schedule()
      }, 1500)
    }
    const status = (payload: unknown) => {
      if (!current()) return
      const parsed = workerStatusEvent.safeParse(payload)
      if (!parsed.success) return
      const event = parsed.data,
        queryKey = queueKeys.workers(session),
        workers = client.getQueryData<WorkerList>(queryKey)
      if (workers?.some((worker) => worker.hostname === event.hostname)) {
        void client.cancelQueries({ queryKey, exact: true })
        client.setQueryData<WorkerList>(queryKey, (rows) =>
          rows?.map((worker) => (worker.hostname === event.hostname ? { ...worker, ...event } : worker)),
        )
      } else {
        void client.cancelQueries({ queryKey, exact: true })
        void client.invalidateQueries({ queryKey, exact: true })
      }
      schedule()
    }
    const task = () => {
      if (current()) schedule()
    }
    const onConnect = () => {
      if (!current()) return
      setConnected(true)
      const dashboard = {
        queryKey: queueKeys.all(session),
        predicate: (query: { queryKey: readonly unknown[] }) =>
          query.queryKey[2] === "workers" || query.queryKey[2] === "stats",
      }
      void client.cancelQueries(dashboard).then(() => {
        if (current()) void client.invalidateQueries(dashboard)
      })
    }
    const onDisconnect = () => {
      if (current()) setConnected(false)
    }
    // Acquire after effect replay so a discarded StrictMode mount never starts a namespace handshake.
    queueMicrotask(() => {
      if (!current()) return
      socket = openAppSocket("/worker")
      socket.on("connect", onConnect)
      socket.on("disconnect", onDisconnect)
      socket.on("worker:status", status)
      socket.on("task:update", task)
      setConnected(socket.connected)
    })
    return () => {
      active = false
      clearTimeout(timer)
      socket?.off("connect", onConnect)
      socket?.off("disconnect", onDisconnect)
      socket?.off("worker:status", status)
      socket?.off("task:update", task)
      if (socket) closeAppSocket(socket)
      void client.cancelQueries({
        queryKey: queueKeys.all(session),
        predicate: (query) => query.getObserversCount() === 0,
      })
    }
  }, [canRead, client, session])
  const refresh = async () => {
    if (!queueAccess("worker:read", session)) return
    await Promise.all([
      workersQuery.refetch(),
      overviewQuery.refetch(),
      ...(queueAccess("task:stats", session) ? [taskQuery.refetch(), workerQuery.refetch()] : []),
    ])
  }
  return {
    days,
    setDays,
    connected: canRead && connected,
    now,
    workers: canRead ? (workersQuery.data ?? []).map(normalizeWorker) : [],
    overview: canRead ? overviewQuery.data : undefined,
    tasks: canReadStats ? (taskQuery.data?.records ?? []) : [],
    workerRanking: canReadStats ? [...(workerQuery.data ?? [])].sort((a, b) => b.total - a.total).slice(0, 10) : [],
    loading:
      canRead && (overviewQuery.isFetching || (canReadStats && (taskQuery.isFetching || workerQuery.isFetching))),
    workersLoading: canRead && workersQuery.isFetching,
    workersFailed: canRead && workersQuery.isError,
    overviewFailed: canRead && overviewQuery.isError,
    rankingFailed: canReadStats && (taskQuery.isError || workerQuery.isError),
    refresh,
  }
}
