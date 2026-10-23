import { useEffect, useLayoutEffect, useRef } from "react"
import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import type { PermissionCode } from "@/typings/permission-codes"
import { fetchRegisteredTasks, type RegisteredTasks } from "@/services/api/task"
import {
  fetchSchedules,
  fetchSchedule,
  createSchedule,
  updateSchedule,
  toggleSchedule,
  deleteSchedule,
  previewSchedule,
  type ScheduleQuery,
  type ScheduleList,
  type ScheduleDetail,
  type ScheduleCreate,
  type ScheduleValue,
} from "@/services/api/schedule"
export const scheduleKeys = {
  all: (session: number) => ["schedules", session] as const,
  list: (session: number, query: ScheduleQuery) => ["schedules", session, "list", query] as const,
  registered: (session: number, opening: string) => ["schedules", session, "registered", opening] as const,
  detail: (session: number, id: string, opening: string) => ["schedules", session, "detail", id, opening] as const,
}
export function scheduleAccess(code: PermissionCode, session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, code)
}
export function requireSchedulePermission(code: PermissionCode, session: number) {
  if (!scheduleAccess("schedule:read", session) || !scheduleAccess(code, session))
    throw new Error("Schedule session or permission changed")
}
async function scheduleData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Schedule response is empty")
  return result.data
}
function useScheduleScope() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    read = usePermission("schedule:read")
  return { session, read: read && session === getAuthSession() }
}
const options = { retry: false, staleTime: 0, gcTime: 0 }
export function useSchedules(query: ScheduleQuery) {
  const { session, read } = useScheduleScope(),
    key = scheduleKeys.list(session, query),
    result = useQuery({
      ...options,
      queryKey: key,
      enabled: read,
      queryFn: () => {
        requireSchedulePermission("schedule:read", session)
        return scheduleData(fetchSchedules(query))
      },
    })
  return { ...result, key, data: read ? result.data : undefined }
}
export function useScheduleTasks(opening: string) {
  const { session, read } = useScheduleScope(),
    registered = usePermission("task:registered"),
    key = scheduleKeys.registered(session, opening),
    query = useQuery({
      ...options,
      queryKey: key,
      enabled: read && registered,
      queryFn: () => {
        requireSchedulePermission("task:registered", session)
        return scheduleData(fetchRegisteredTasks())
      },
    })
  return {
    key,
    query,
    tasks: read && registered && !query.isError && !query.isFetching ? (query.data?.tasks ?? []) : [],
  }
}
export function useScheduleDetail(id: string, opening: string) {
  const { session, read } = useScheduleScope(),
    key = scheduleKeys.detail(session, id, opening),
    query = useQuery({
      ...options,
      queryKey: key,
      enabled: read && Boolean(id),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      queryFn: () => {
        requireSchedulePermission("schedule:read", session)
        if (!id) throw new Error("Missing schedule identity")
        return scheduleData(fetchSchedule(id))
      },
    })
  return { ...query, key, data: read ? query.data : undefined }
}
export async function loadSchedulePreview(value: ScheduleValue, session: number) {
  requireSchedulePermission("schedule:read", session)
  const result = await scheduleData(previewSchedule({ schedule: value }))
  return { ...result, nextRuns: result.nextRuns ?? [] }
}
export interface ScheduleSave {
  body: ScheduleCreate
  registeredKey: QueryKey
  id?: string
  detailKey?: QueryKey
}
type Operation = ({ kind: "save" } & ScheduleSave) | { kind: "toggle" | "delete"; id: string }
export function useScheduleOperations(recordKey?: QueryKey) {
  const client = useQueryClient(),
    session = useRef(getAuthSession()).current,
    alive = useRef(true),
    currentKey = useRef(recordKey),
    locks = useRef(new Set<string>()),
    mutationKey = [...scheduleKeys.all(session), "mutation"]
  useLayoutEffect(() => {
    currentKey.current = recordKey
  }, [recordKey])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const count = useIsMutating({ mutationKey }),
    identity = (operation: Operation) => operation.id || "create"
  const pending = (id: string) =>
    client.isMutating({
      mutationKey,
      predicate: (mutation) => {
        const variables = mutation.state.variables
        return (
          typeof variables === "object" &&
          variables !== null &&
          "kind" in variables &&
          ("id" in variables && typeof variables.id === "string" && variables.id ? variables.id : "create") === id
        )
      },
    }) > 0
  function permission(operation: Operation): PermissionCode {
    return operation.kind === "delete"
      ? "schedule:delete"
      : operation.kind === "toggle" || operation.id
        ? "schedule:update"
        : "schedule:create"
  }
  function fresh(key: QueryKey | undefined, kind: string) {
    if (!key || key[0] !== "schedules" || key[1] !== session || key[2] !== kind) return false
    const state = client.getQueryState(key)
    return state?.status === "success" && state.fetchStatus === "idle"
  }
  function valid(operation: Operation) {
    if (!alive.current || !scheduleAccess("schedule:read", session) || !scheduleAccess(permission(operation), session))
      return false
    if (operation.kind !== "save") {
      const key = currentKey.current
      return (
        fresh(key, "list") &&
        Boolean(key && client.getQueryData<ScheduleList>(key)?.records.some((row) => row.id === operation.id))
      )
    }
    if (
      !operation.body.name.trim() ||
      !scheduleAccess("task:registered", session) ||
      !fresh(operation.registeredKey, "registered") ||
      !client.getQueryData<RegisteredTasks>(operation.registeredKey)?.tasks.includes(operation.body.task)
    )
      return false
    if (!operation.id) return true
    return (
      fresh(operation.detailKey, "detail") &&
      operation.detailKey?.[3] === operation.id &&
      client.getQueryData<ScheduleDetail>(operation.detailKey)?.id === operation.id
    )
  }
  const mutation = useMutation({
    mutationKey,
    mutationFn: async (operation: Operation) => {
      if (!valid(operation)) throw new Error("Schedule operation is unavailable")
      if (operation.kind === "save")
        return scheduleData(
          operation.id ? updateSchedule(operation.id, operation.body) : createSchedule(operation.body),
        )
      if (operation.kind === "toggle") return scheduleData(toggleSchedule(operation.id))
      const accepted = await scheduleData(deleteSchedule(operation.id))
      if (!accepted) throw new Error("Schedule deletion was not accepted")
      return accepted
    },
    onSuccess: () => {
      if (scheduleAccess("schedule:read", session))
        void client.invalidateQueries({
          queryKey: scheduleKeys.all(session),
          predicate: (query) => query.queryKey[2] === "list",
          refetchType: "none",
        })
    },
  })
  async function run(operation: Operation) {
    const id = identity(operation)
    if (locks.current.has(id) || pending(id) || !valid(operation)) return false
    locks.current.add(id)
    try {
      await mutation.mutateAsync(operation)
      return alive.current && scheduleAccess("schedule:read", session) && scheduleAccess(permission(operation), session)
    } catch {
      return false
    } finally {
      locks.current.delete(id)
    }
  }
  return {
    save: (input: ScheduleSave) => run({ kind: "save", ...input }),
    toggle: (id: string) => run({ kind: "toggle", id }),
    remove: (id: string) => run({ kind: "delete", id }),
    isPending: (id: string) => locks.current.has(id) || (count > 0 && pending(id)),
  }
}
