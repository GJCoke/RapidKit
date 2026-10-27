import { request } from "../request"

/** get all workers (no pagination) */
export function fetchGetAllWorkers() {
  return request<Api.Worker.WorkerInfo[]>({
    url: "/workers/all",
    method: "get",
  })
}

/** get worker detail */
export function fetchGetWorkerDetail(workerId: string) {
  return request<Api.Worker.WorkerDetail>({
    url: `/workers/${workerId}`,
    method: "get",
  })
}

/** get task list (paginated) */
export function fetchGetTaskList(params?: Api.Worker.TaskSearchParams) {
  return request<Api.Worker.TaskList>({
    url: "/tasks",
    method: "get",
    params,
  })
}

/** get task detail */
export function fetchGetTaskDetail(taskId: string) {
  return request<Api.Worker.TaskInfo>({
    url: `/tasks/${taskId}`,
    method: "get",
  })
}

/** get registered tasks */
export function fetchGetRegisteredTasks() {
  return request<Api.Worker.RegisteredTasksResponse>({
    url: "/tasks/registered",
    method: "get",
  })
}

/** trigger a task */
export function fetchTriggerTask(data: Api.Worker.TriggerTaskRequest) {
  return request<Api.Worker.TriggerTaskResponse>({
    url: "/tasks/trigger",
    method: "post",
    data,
  })
}

/** revoke a task */
export function fetchRevokeTask(taskId: string) {
  return request<boolean>({
    url: `/tasks/${taskId}/revoke`,
    method: "post",
  })
}

/** get task stats summary */
export function fetchTaskStatsSummary(params?: Api.Worker.TaskStatsQuery) {
  return request<Api.Worker.TaskStatsSummary>({
    url: "/tasks/stats/summary",
    method: "get",
    params,
  })
}

/** get task stats by name */
export function fetchTaskStatsByName(params?: Api.Worker.TaskGroupQuery) {
  return request<Api.Worker.TaskGroupList>({
    url: "/tasks/stats/by-name",
    method: "get",
    params,
  })
}

/** get task stats by worker */
export function fetchTaskStatsByWorker(params?: Api.Worker.TaskStatsQuery) {
  return request<Api.Worker.TaskStatsByWorker[]>({
    url: "/tasks/stats/by-worker",
    method: "get",
    params,
  })
}

// ==================== Schedule APIs ====================

/** preview any periodic schedule using the server's timezone */
export function fetchGetSchedulePreview(data: Api.Worker.SchedulePreviewRequest) {
  return request<Api.Worker.SchedulePreviewResponse>({
    url: "/schedules/preview",
    method: "post",
    data,
  })
}

/** get schedule list (paginated) */
export function fetchGetScheduleList(params?: Api.Worker.PeriodicTaskSearchParams) {
  return request<Api.Worker.PeriodicTaskList>({
    url: "/schedules",
    method: "get",
    params,
  })
}

/** get schedule detail */
export function fetchGetScheduleDetail(id: string) {
  return request<Api.Worker.PeriodicTaskInfo>({
    url: `/schedules/${id}`,
    method: "get",
  })
}

/** create schedule */
export function fetchCreateSchedule(data: Api.Worker.PeriodicTaskCreate) {
  return request<Api.Worker.PeriodicTaskInfo>({
    url: "/schedules",
    method: "post",
    data,
  })
}

/** update schedule */
export function fetchUpdateSchedule(id: string, data: Api.Worker.PeriodicTaskUpdate) {
  return request<Api.Worker.PeriodicTaskInfo>({
    url: `/schedules/${id}`,
    method: "put",
    data,
  })
}

/** toggle schedule */
export function fetchToggleSchedule(id: string) {
  return request<Api.Worker.PeriodicTaskInfo>({
    url: `/schedules/${id}/toggle`,
    method: "patch",
  })
}

/** delete schedule */
export function fetchDeleteSchedule(id: string) {
  return request<boolean>({
    url: `/schedules/${id}`,
    method: "delete",
  })
}

// ==================== Worker Control APIs ====================

/** ping worker */
export function fetchPingWorker(workerId: string) {
  return request<Api.Worker.WorkerControlResponse>({
    url: `/workers/${workerId}/ping`,
    method: "post",
  })
}

/** shutdown worker */
export function fetchShutdownWorker(workerId: string) {
  return request<Api.Worker.WorkerControlResponse>({
    url: `/workers/${workerId}/shutdown`,
    method: "post",
  })
}

/** pool grow */
export function fetchPoolGrow(workerId: string, data: Api.Worker.PoolResizeRequest) {
  return request<Api.Worker.WorkerControlResponse>({
    url: `/workers/${workerId}/pool/grow`,
    method: "post",
    data,
  })
}

/** pool shrink */
export function fetchPoolShrink(workerId: string, data: Api.Worker.PoolResizeRequest) {
  return request<Api.Worker.WorkerControlResponse>({
    url: `/workers/${workerId}/pool/shrink`,
    method: "post",
    data,
  })
}

/** add queue consumer */
export function fetchAddQueue(workerId: string, data: Api.Worker.QueueOperateRequest) {
  return request<Api.Worker.WorkerControlResponse>({
    url: `/workers/${workerId}/queues/add`,
    method: "post",
    data,
  })
}

/** cancel queue consumer */
export function fetchCancelQueue(workerId: string, data: Api.Worker.QueueOperateRequest) {
  return request<Api.Worker.WorkerControlResponse>({
    url: `/workers/${workerId}/queues/cancel`,
    method: "post",
    data,
  })
}

/** get active tasks of worker */
export function fetchActiveTasksOfWorker(workerId: string) {
  return request<Api.Worker.ActiveTaskInfo[]>({
    url: `/workers/${workerId}/tasks/active`,
    method: "get",
  })
}

/** get reserved tasks of worker */
export function fetchReservedTasksOfWorker(workerId: string) {
  return request<Api.Worker.ActiveTaskInfo[]>({
    url: `/workers/${workerId}/tasks/reserved`,
    method: "get",
  })
}

/** Broker state and completion-based Celery overview. */
export function fetchQueueDashboard(params: Api.Worker.QueueDashboardQuery) {
  return request<Api.Worker.QueueDashboard>({ url: "/tasks/stats/dashboard", method: "get", params })
}

export function fetchWorkerGroups() {
  return request<Api.Worker.WorkerGroup[]>({ url: "/workers/groups", method: "get" })
}

export function fetchWorkerHistory(params: Api.Worker.WorkerHistoryQuery) {
  return request<Api.Worker.WorkerHistory>({ url: "/workers/history", method: "get", params })
}

export function fetchRetireWorker(workerId: string) {
  return request<Api.Worker.WorkerInfo>({ url: `/workers/${workerId}/retire`, method: "post" })
}
