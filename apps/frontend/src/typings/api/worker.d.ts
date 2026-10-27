import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace Worker
     *
     * backend api module: "worker"
     */
    namespace Worker {
      /**
       * worker status
       *
       * - "1": online
       * - "2": offline
       */
      type WorkerStatus = "1" | "2"

      /**
       * task status
       *
       * - "1": pending
       * - "2": started
       * - "3": success
       * - "4": failure
       * - "5": retry
       * - "6": revoked
       */
      type TaskStatus = "1" | "2" | "3" | "4" | "5" | "6"

      type WorkerGroup = Service.ApiResponse<"/api/v1/workers/groups">[number]
      type WorkerHistory = Service.ApiResponse<"/api/v1/workers/history">
      type WorkerHistoryQuery = Service.ApiRequest<"/api/v1/workers/history", "get", "query">

      /** worker info */
      type WorkerInfo = {
        id: string
        hostname: string
        groupName: string
        lifecycle: "active" | "draining" | "retired"
        deploymentId: string
        retiredAt: string | null
        retireReason: string
        status: WorkerStatus
        activeQueues: string[]
        concurrency: number
        processedCount: number
        activeTaskCount: number
        loadAverage: Record<string, any>
        softwareInfo: Record<string, any>
        lastHeartbeat: string
        createTime: string
        updateTime: string
      }

      /** Worker detail with independently nullable live inspection fields. */
      type WorkerDetail = Service.ApiResponse<"/api/v1/workers/{worker_id}">

      /** task result info */
      type TaskInfo = Service.ApiResponse<"/api/v1/tasks/{task_id}">

      /** task list item */
      type TaskListItem = {
        id: string
        taskId: string
        taskName: string
        status: TaskStatus
        workerHostname: string
        startedAt: string | null
        finishedAt: string | null
        runtime: number | null
        retries: number
        createTime: string
        updateTime: string
      }

      /** task search params */
      type TaskSearchParams = Service.ApiRequest<"/api/v1/tasks", "get", "query">

      /** task list */
      type TaskList = Service.ApiResponse<"/api/v1/tasks">

      /** trigger task request */
      type TriggerTaskRequest = Service.ApiRequest<"/api/v1/tasks/trigger", "post", "body">

      /** trigger task response */
      type TriggerTaskResponse = Service.ApiResponse<"/api/v1/tasks/trigger", "post">

      /** registered tasks response */
      type RegisteredTasksResponse = Service.ApiResponse<"/api/v1/tasks/registered">

      /** Socket.IO worker:status event data */
      type WorkerStatusEvent = {
        hostname: string
        groupName: string
        lifecycle: "active" | "draining" | "retired"
        status: WorkerStatus
        concurrency: number
        activeTaskCount: number
        activeQueues: string[]
        lastHeartbeat: string
        processedCount: number
      }

      /** task stats query params */
      type TaskStatsQuery = Service.ApiRequest<"/api/v1/tasks/stats/summary", "get", "query">

      type QueueDashboardQuery = Service.ApiRequest<"/api/v1/tasks/stats/dashboard", "get", "query">
      type QueueDashboard = Service.ApiResponse<"/api/v1/tasks/stats/dashboard">

      /** task stats summary */
      type TaskStatsSummary = Service.ApiResponse<"/api/v1/tasks/stats/summary">

      /** task stats by task name */
      type TaskGroupQuery = Service.ApiRequest<"/api/v1/tasks/stats/by-name", "get", "query">
      type TaskGroupList = Service.ApiResponse<"/api/v1/tasks/stats/by-name">
      type TaskGroupItem = TaskGroupList["records"][number]

      /** task stats by worker */
      type TaskStatsByWorker = {
        workerHostname: string
        total: number
        success: number
        failure: number
        avgRuntime: number | null
      }

      /** Socket.IO task:update event data */
      type TaskUpdateEvent = {
        taskId: string
        taskName?: string
        status: TaskStatus
        workerHostname?: string
        runtime?: number
        exception?: string
      }

      type SchedulePreviewRequest = Service.ApiRequest<"/api/v1/schedules/preview", "post", "body">
      type SchedulePreviewResponse = Service.ApiResponse<"/api/v1/schedules/preview", "post">
      type ScheduleType = PeriodicTaskCreate["schedule"]["type"]
      type PeriodicTaskInfo = Service.ApiResponse<"/api/v1/schedules/{schedule_id}">
      type PeriodicTaskListItem = PeriodicTaskList["records"][number]

      /** periodic task search params */
      type PeriodicTaskSearchParams = Service.ApiRequest<"/api/v1/schedules", "get", "query">

      /** periodic task list */
      type PeriodicTaskList = Service.ApiResponse<"/api/v1/schedules">

      /** periodic task create request */
      type PeriodicTaskCreate = Service.ApiRequest<"/api/v1/schedules", "post", "body">

      /** periodic task update request */
      type PeriodicTaskUpdate = Service.ApiRequest<"/api/v1/schedules/{schedule_id}", "put", "body">

      // ==================== Worker Control Types ====================

      /** pool resize request */
      type PoolResizeRequest = Service.ApiRequest<"/api/v1/workers/{worker_id}/pool/grow", "post", "body">

      /** queue operate request */
      type QueueOperateRequest = Service.ApiRequest<"/api/v1/workers/{worker_id}/queues/add", "post", "body">

      /** active/reserved task info */
      type ActiveTaskInfo = {
        id: string
        name: string
        args: string
        kwargs: string
        workerPid: number | null
        timeStart: number | null
      }

      /** worker control response */
      type WorkerControlResponse = Service.ApiResponse<"/api/v1/workers/{worker_id}/ping", "post">
    }
  }
}
