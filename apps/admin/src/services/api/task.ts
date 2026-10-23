import { request } from "@/services/request"
import type { ApiRequest, ApiResponse } from "@/typings/service"
import type { TaskRanking, TaskRankingQuery } from "./worker"
export { fetchTaskRanking as fetchTaskGroups } from "./worker"
export type TaskList = ApiResponse<"/api/v1/tasks">
export type TaskRecord = TaskList["records"][number]
export type TaskStatus = TaskRecord["status"]
export type TaskDetail = ApiResponse<"/api/v1/tasks/{task_id}">
export type TaskQuery = NonNullable<ApiRequest<"/api/v1/tasks", "get", "query">>
export type RegisteredTasks = ApiResponse<"/api/v1/tasks/registered">
export type TriggerTaskBody = ApiRequest<"/api/v1/tasks/trigger", "post", "body">
export type TriggerTaskResult = ApiResponse<"/api/v1/tasks/trigger", "post">
export type TaskGroups = TaskRanking
export type TaskGroupQuery = TaskRankingQuery
export function fetchTasks(params: TaskQuery) {
  return request<TaskList>({ url: "/tasks", method: "get", params })
}
export function fetchTask(taskId: string) {
  return request<TaskDetail>({ url: `/tasks/${encodeURIComponent(taskId)}`, method: "get" })
}
export function fetchRegisteredTasks() {
  return request<RegisteredTasks>({ url: "/tasks/registered", method: "get" })
}
export function triggerTask(data: TriggerTaskBody) {
  return request<TriggerTaskResult>({ url: "/tasks/trigger", method: "post", data })
}
export function revokeTask(taskId: string) {
  return request<ApiResponse<"/api/v1/tasks/{task_id}/revoke", "post">>({
    url: `/tasks/${encodeURIComponent(taskId)}/revoke`,
    method: "post",
  })
}
