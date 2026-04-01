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

      /** worker info */
      type WorkerInfo = {
        id: string
        hostname: string
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

      /** worker search params */
      type WorkerSearchParams = Api.Common.CommonSearchParams & {
        status?: WorkerStatus | null
        hostname?: string | null
      }

      /** worker list */
      type WorkerList = Api.Common.PaginatingQueryRecord<WorkerInfo>

      /** task result info */
      type TaskInfo = {
        id: string
        taskId: string
        taskName: string
        status: TaskStatus
        workerHostname: string
        args: any[]
        kwargs: Record<string, any>
        result: any
        exception: string | null
        traceback: string | null
        logs: string | null
        startedAt: string | null
        finishedAt: string | null
        runtime: number | null
        retries: number
        createTime: string
        updateTime: string
      }

      /** task list item (without traceback etc.) */
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
      type TaskSearchParams = Api.Common.CommonSearchParams & {
        status?: TaskStatus | null
        taskName?: string | null
        workerHostname?: string | null
      }

      /** task list */
      type TaskList = Api.Common.PaginatingQueryRecord<TaskListItem>

      /** trigger task request */
      type TriggerTaskRequest = {
        taskName: string
        args?: any[]
        kwargs?: Record<string, any>
      }

      /** trigger task response */
      type TriggerTaskResponse = {
        taskId: string
      }

      /** registered tasks response */
      type RegisteredTasksResponse = {
        tasks: string[]
      }

      /** Socket.IO worker:status event data */
      type WorkerStatusEvent = {
        hostname: string
        status: WorkerStatus
        concurrency: number
        activeTaskCount: number
        activeQueues: string[]
        lastHeartbeat: string
      }

      /** task stats query params */
      type TaskStatsQuery = { days?: number }

      /** task stats summary */
      type TaskStatsSummary = {
        total: number
        success: number
        failure: number
        retry: number
        revoked: number
        successRate: number
        avgRuntime: number | null
      }

      /** task stats timeline data point */
      type TaskStatsTimeline = {
        timeBucket: string
        total: number
        success: number
        failure: number
      }

      /** task stats by task name */
      type TaskStatsByName = {
        taskName: string
        total: number
        success: number
        failure: number
        avgRuntime: number | null
      }

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

      // ==================== Schedule Types ====================

      /** schedule type */
      type ScheduleType = "interval" | "crontab"

      /** interval schedule config */
      type IntervalConfig = {
        every: number
        period: string
      }

      /** crontab schedule config */
      type CrontabConfig = {
        minute: string
        hour: string
        dayOfWeek: string
        dayOfMonth: string
        monthOfYear: string
      }

      /** periodic task info */
      type PeriodicTaskInfo = {
        id: string
        name: string
        task: string
        taskType: ScheduleType
        enabled: boolean
        description: string
        scheduleId: string
        args: any[]
        kwargs: Record<string, any>
        interval: IntervalConfig | null
        crontab: CrontabConfig | null
        createTime: string
        updateTime: string
      }

      /** periodic task list item */
      type PeriodicTaskListItem = {
        id: string
        name: string
        task: string
        taskType: ScheduleType
        enabled: boolean
        description: string
        scheduleId: string
        interval: IntervalConfig | null
        crontab: CrontabConfig | null
        createTime: string
        updateTime: string
      }

      /** periodic task search params */
      type PeriodicTaskSearchParams = Api.Common.CommonSearchParams & {
        enabled?: number | null
        taskName?: string | null
      }

      /** periodic task list */
      type PeriodicTaskList = Api.Common.PaginatingQueryRecord<PeriodicTaskListItem>

      /** periodic task create request */
      type PeriodicTaskCreate = {
        name: string
        task: string
        taskType: ScheduleType
        enabled?: boolean
        description?: string
        args?: any[]
        kwargs?: Record<string, any>
        interval?: IntervalConfig | null
        crontab?: CrontabConfig | null
      }

      /** periodic task update request */
      type PeriodicTaskUpdate = {
        name?: string
        task?: string
        enabled?: boolean
        description?: string
        args?: any[]
        kwargs?: Record<string, any>
        interval?: IntervalConfig | null
        crontab?: CrontabConfig | null
      }

      // ==================== Worker Control Types ====================

      /** pool resize request */
      type PoolResizeRequest = { n: number }

      /** queue operate request */
      type QueueOperateRequest = { queue: string }

      /** active/reserved task info from Celery inspect */
      type ActiveTaskInfo = {
        id: string
        name: string
        args: string
        kwargs: string
        workerPid: number | null
        timeStart: number | null
      }

      /** worker control response */
      type WorkerControlResponse = {
        success: boolean
        message: string
      }
    }
  }
}

export {}
