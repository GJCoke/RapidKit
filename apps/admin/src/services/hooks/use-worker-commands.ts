import { useEffect, useRef } from "react"
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { sendWorkerCommand, type WorkerCommand, type WorkerList, type WorkerDetail } from "@/services/api/worker"
import { normalizeWorker, validResize, workerHealth } from "@/views/queue/dashboard/modules/queue-model"
import { queueAccess, queueData, queueKeys } from "./use-queue-dashboard"
export function useWorkerCommands() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    client = useQueryClient(),
    alive = useRef(true),
    locks = useRef(new Set<string>()),
    mutationKey = [...queueKeys.all(session), "command"]
  const pendingCount = useIsMutating({ mutationKey })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const pending = (id: string) =>
    client.isMutating({
      mutationKey,
      predicate: (mutation) => {
        const variables = mutation.state.variables
        return typeof variables === "object" && variables !== null && "id" in variables && variables.id === id
      },
    }) > 0
  const validate = (id: string, command: WorkerCommand): WorkerCommand | null => {
    if (!alive.current || !queueAccess("worker:read", session) || !queueAccess("worker:control", session)) return null
    const raw = client.getQueryData<WorkerList>(queueKeys.workers(session))?.find((worker) => worker.id === id)
    if (!raw) return null
    const worker = normalizeWorker(raw)
    if (command.type === "shutdown" ? worker.status !== "1" : workerHealth(worker) !== "online") return null
    const detail = client.getQueryData<WorkerDetail>([...queueKeys.worker(session, id), "detail"]),
      concurrency = detail?.runtimeConcurrency ?? worker.concurrency,
      queues = (detail?.activeQueues ?? worker.activeQueues).filter(
        (queue): queue is string => typeof queue === "string",
      )
    if ("n" in command && !validResize(command.n, concurrency, command.type)) return null
    if ("queue" in command) {
      const queue = command.queue.trim()
      if (
        !queue ||
        (command.type === "add" && queues.includes(queue)) ||
        (command.type === "cancel" && !queues.includes(queue))
      )
        return null
      return { ...command, queue }
    }
    return command
  }
  const mutation = useMutation({
    mutationKey,
    mutationFn: async ({ id, command }: { id: string; command: WorkerCommand }) => {
      const valid = validate(id, command)
      if (!valid) throw new Error("Worker command is unavailable")
      const data = await queueData(sendWorkerCommand(id, valid))
      if (!data.success) throw new Error("Worker did not confirm command success")
      return data
    },
    onSuccess: async () => {
      if (session !== getAuthSession()) return
      const snapshots = {
        queryKey: queueKeys.all(session),
        predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[4] !== "inspection",
      }
      await client.cancelQueries(snapshots)
      if (session === getAuthSession()) void client.invalidateQueries(snapshots)
    },
  })
  const run = async (id: string, command: WorkerCommand): Promise<boolean> => {
    if (locks.current.has(id) || pending(id) || !validate(id, command)) return false
    locks.current.add(id)
    try {
      await mutation.mutateAsync({ id, command })
      return alive.current && queueAccess("worker:control", session) && queueAccess("worker:read", session)
    } catch {
      return false
    } finally {
      locks.current.delete(id)
    }
  }
  return { run, isPending: (id: string) => locks.current.has(id) || (pendingCount > 0 && pending(id)) }
}
