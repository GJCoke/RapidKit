import { useEffect, useRef } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { fetchWorkerTasks } from "@/services/api/worker"
import { queueKeys, queueData, queueAccess, requireQueuePermission } from "./use-queue-dashboard"
function clearInactiveInspections(client: QueryClient, session: number) {
  const filter = {
    queryKey: queueKeys.all(session),
    predicate: (query: { queryKey: readonly unknown[]; getObserversCount: () => number }) =>
      query.queryKey[2] === "worker" && query.queryKey[4] === "inspection" && query.getObserversCount() === 0,
  }
  void client.cancelQueries(filter)
  client.removeQueries(filter)
}
/** Mounted on the first task-tab visit and retained until this worker drawer closes. */
export function useWorkerInspection(id: string, online: boolean) {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    read = usePermission("worker:read"),
    canRead = read && session === getAuthSession(),
    client = useQueryClient(),
    alive = useRef(true),
    lock = useRef(false),
    inspectedWorker = useRef<string | null>(null),
    current = useRef({ id, online })
  current.current = { id, online }
  const prefix = [...queueKeys.worker(session, id), "inspection"],
    options = { retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false }
  const load = (kind: "active" | "reserved") => {
    requireQueuePermission("worker:read", session)
    if (!current.current.online || current.current.id !== id) throw new Error("Worker inspection changed")
    inspectedWorker.current = id
    return queueData(fetchWorkerTasks(id, kind))
  }
  const inspectInitially = canRead && online && inspectedWorker.current !== id
  const active = useQuery({
    ...options,
    queryKey: [...prefix, "active", online],
    queryFn: () => load("active"),
    enabled: inspectInitially,
    refetchOnMount: "always",
  })
  const reserved = useQuery({
    ...options,
    queryKey: [...prefix, "reserved", online],
    queryFn: () => load("reserved"),
    enabled: inspectInitially,
    refetchOnMount: "always",
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [client, session])
  useEffect(() => {
    clearInactiveInspections(client, session)
  }, [client, session, id, online])
  const sample = (query: typeof active) => {
    const available = canRead && online && query.isFetchedAfterMount
    return {
      rows: available ? (query.data ?? []) : [],
      sampledAt: available && query.dataUpdatedAt ? query.dataUpdatedAt : null,
      loading: canRead && online && query.isFetching,
      failed: canRead && online && query.isError,
    }
  }
  const refresh = async () => {
    if (
      !alive.current ||
      !queueAccess("worker:read", session) ||
      current.current.id !== id ||
      !current.current.online ||
      active.isFetching ||
      reserved.isFetching ||
      lock.current
    )
      return false
    lock.current = true
    try {
      await Promise.all([active.refetch(), reserved.refetch()])
      return true
    } finally {
      lock.current = false
    }
  }
  return { active: sample(active), reserved: sample(reserved), refresh }
}
