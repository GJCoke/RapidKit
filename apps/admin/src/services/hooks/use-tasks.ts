import { useEffect, useLayoutEffect, useRef } from "react"
import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import type { PermissionCode } from "@/typings/permission-codes"
import {
  fetchTasks,
  fetchTask,
  fetchTaskGroups,
  fetchRegisteredTasks,
  triggerTask,
  revokeTask,
  type TaskQuery,
  type TaskList,
  type TaskGroupQuery,
  type TriggerTaskBody,
  type RegisteredTasks,
} from "@/services/api/task"
import { taskRecordQuery, type TaskViewState } from "@/views/queue/task/modules/task-view-state"
export const taskKeys = {
  all: (session: number) => ["tasks", session] as const,
  records: (session: number, query: TaskQuery) => ["tasks", session, "records", query] as const,
  groups: (session: number, query: TaskGroupQuery) => ["tasks", session, "groups", query] as const,
  detail: (session: number, id: string) => ["tasks", session, "detail", id] as const,
  registered: (session: number, opening: string) => ["tasks", session, "registered", opening] as const,
}
export function taskAccess(code: PermissionCode, session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, code)
}
function requireAccess(code: PermissionCode, session: number) {
  if (!taskAccess("task:read", session) || !taskAccess(code, session))
    throw new Error("Task session or permission changed")
}
async function taskData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Task response is empty")
  return result.data
}
const options = { retry: false, staleTime: 0, gcTime: 0 }
export function useTaskRecords(state: TaskViewState, pagination: { page: number; pageSize: number }, enabled = true) {
  const read = usePermission("task:read"),
    session = getAuthSession(),
    query = taskRecordQuery(state, pagination),
    key = taskKeys.records(session, query)
  const result = useQuery({
    ...options,
    queryKey: key,
    enabled: read && enabled,
    queryFn: () => {
      requireAccess("task:read", session)
      return taskData(fetchTasks(query))
    },
  })
  return { ...result, key, data: read && enabled ? result.data : undefined }
}
export function useTaskGroups(query: TaskGroupQuery, enabled = true) {
  const read = usePermission("task:read"),
    stats = usePermission("task:stats"),
    session = getAuthSession()
  const result = useQuery({
    ...options,
    queryKey: taskKeys.groups(session, query),
    enabled: read && stats && enabled,
    queryFn: () => {
      requireAccess("task:stats", session)
      return taskData(fetchTaskGroups(query))
    },
  })
  return { ...result, data: read && stats && enabled ? result.data : undefined }
}
export function useTaskDetail(id: string) {
  const read = usePermission("task:read"),
    session = getAuthSession()
  const result = useQuery({
    ...options,
    queryKey: taskKeys.detail(session, id),
    enabled: read && Boolean(id),
    queryFn: () => {
      requireAccess("task:read", session)
      return taskData(fetchTask(id))
    },
  })
  return { ...result, data: read ? result.data : undefined }
}
export function useTaskRegistration(opening: string) {
  const read = usePermission("task:read"),
    registered = usePermission("task:registered"),
    session = getAuthSession(),
    key = taskKeys.registered(session, opening),
    query = useQuery({
      ...options,
      queryKey: key,
      enabled: read && registered,
      queryFn: () => {
        requireAccess("task:registered", session)
        return taskData(fetchRegisteredTasks())
      },
    })
  return {
    key,
    query,
    tasks: read && registered && !query.isError && !query.isFetching ? (query.data?.tasks ?? []) : [],
  }
}
type Operation = { kind: "trigger"; body: TriggerTaskBody; registered: QueryKey } | { kind: "revoke"; id: string }
export function useTaskOperations(recordKey?: QueryKey) {
  const client = useQueryClient(),
    session = useRef(getAuthSession()).current,
    alive = useRef(true),
    currentKey = useRef(recordKey),
    locks = useRef(new Set<string>()),
    mutationKey = [...taskKeys.all(session), "mutation"]
  useLayoutEffect(() => {
    currentKey.current = recordKey
  }, [recordKey])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const count = useIsMutating({ mutationKey })
  const pending = (kind: Operation["kind"], id?: string) =>
    client.isMutating({
      mutationKey,
      predicate: (mutation) => {
        const value = mutation.state.variables
        return (
          typeof value === "object" &&
          value !== null &&
          "kind" in value &&
          value.kind === kind &&
          (kind === "trigger" || ("id" in value && value.id === id))
        )
      },
    }) > 0
  function valid(operation: Operation) {
    if (
      !alive.current ||
      !taskAccess("task:read", session) ||
      !taskAccess(operation.kind === "trigger" ? "task:trigger" : "task:revoke", session)
    )
      return false
    const key = operation.kind === "trigger" ? operation.registered : currentKey.current
    if (
      !key ||
      key[0] !== "tasks" ||
      key[1] !== session ||
      key[2] !== (operation.kind === "trigger" ? "registered" : "records")
    )
      return false
    const state = client.getQueryState(key)
    if (state?.status !== "success" || state.fetchStatus !== "idle") return false
    if (operation.kind === "trigger")
      return (
        taskAccess("task:registered", session) &&
        Boolean(client.getQueryData<RegisteredTasks>(key)?.tasks.includes(operation.body.taskName))
      )
    const row = client.getQueryData<TaskList>(key)?.records.find((row) => row.taskId === operation.id)
    return row?.status === "1" || row?.status === "2"
  }
  const mutation = useMutation({
    mutationKey,
    mutationFn: async (operation: Operation) => {
      if (!valid(operation)) throw new Error("Task operation is unavailable")
      if (operation.kind === "trigger") return taskData(triggerTask(operation.body))
      const accepted = await taskData(revokeTask(operation.id))
      if (!accepted) throw new Error("Task revoke was not accepted")
      return accepted
    },
    onSuccess: (_data, operation) => {
      if (operation.kind === "revoke" && taskAccess("task:read", session))
        void client.invalidateQueries({
          queryKey: taskKeys.all(session),
          predicate: (query) => query.queryKey[2] === "records",
        })
    },
  })
  async function run(operation: Operation) {
    const lock = operation.kind === "trigger" ? "trigger" : `revoke:${operation.id}`
    if (
      locks.current.has(lock) ||
      pending(operation.kind, operation.kind === "revoke" ? operation.id : undefined) ||
      !valid(operation)
    )
      return false
    locks.current.add(lock)
    try {
      await mutation.mutateAsync(operation)
      return (
        alive.current &&
        taskAccess("task:read", session) &&
        taskAccess(operation.kind === "trigger" ? "task:trigger" : "task:revoke", session)
      )
    } catch {
      return false
    } finally {
      locks.current.delete(lock)
    }
  }
  return {
    trigger: (body: TriggerTaskBody, registered: QueryKey) => run({ kind: "trigger", body, registered }),
    revoke: (id: string) => run({ kind: "revoke", id }),
    triggerPending: count > 0 && pending("trigger"),
    revokePending: (id: string) => locks.current.has(`revoke:${id}`) || (count > 0 && pending("revoke", id)),
  }
}
