import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"
export type WorkerList = ApiResponse<"/api/v1/workers/all">
export type Worker = WorkerList[number]
export type WorkerDetail = ApiResponse<"/api/v1/workers/{worker_id}">
export type WorkerTasks = ApiResponse<"/api/v1/workers/{worker_id}/tasks/active">
export type QueueOverview = ApiResponse<"/api/v1/tasks/stats/dashboard">
export type QueueOverviewQuery = NonNullable<ApiRequest<"/api/v1/tasks/stats/dashboard", "get", "query">>
export type TaskRankingQuery = NonNullable<ApiRequest<"/api/v1/tasks/stats/by-name", "get", "query">>
export type TaskRanking = ApiResponse<"/api/v1/tasks/stats/by-name">
export type WorkerRanking = ApiResponse<"/api/v1/tasks/stats/by-worker">
export type WorkerRankingQuery = NonNullable<ApiRequest<"/api/v1/tasks/stats/by-worker", "get", "query">>
export type WorkerCommandResponse = ApiResponse<"/api/v1/workers/{worker_id}/ping", "post">
export type WorkerCommand =
  | { type: "ping" | "shutdown" }
  | { type: "grow" | "shrink"; n: number }
  | { type: "add" | "cancel"; queue: string }
export function fetchWorkers() {
  return request<WorkerList>({ url: "/workers/all", method: "get" })
}
export function fetchWorkerDetail(id: string) {
  return request<WorkerDetail>({ url: `/workers/${id}`, method: "get" })
}
export function fetchWorkerTasks(id: string, kind: "active" | "reserved") {
  return request<WorkerTasks>({ url: `/workers/${id}/tasks/${kind}`, method: "get" })
}
export function fetchQueueOverview(params: QueueOverviewQuery) {
  return request<QueueOverview>({ url: "/tasks/stats/dashboard", method: "get", params })
}
export function fetchTaskRanking(params: TaskRankingQuery) {
  return request<TaskRanking>({ url: "/tasks/stats/by-name", method: "get", params })
}
export function fetchWorkerRanking(params: WorkerRankingQuery) {
  return request<WorkerRanking>({ url: "/tasks/stats/by-worker", method: "get", params })
}
export function sendWorkerCommand(id: string, command: WorkerCommand) {
  const suffix =
    command.type === "grow" || command.type === "shrink"
      ? `pool/${command.type}`
      : command.type === "add" || command.type === "cancel"
        ? `queues/${command.type}`
        : command.type
  const data = "n" in command ? { n: command.n } : "queue" in command ? { queue: command.queue } : undefined
  return request<WorkerCommandResponse>({ url: `/workers/${id}/${suffix}`, method: "post", ...(data ? { data } : {}) })
}
