export type TaskViewState = {
  view: "records" | "groups"
  task: string
  keyword: string
  worker: string
  status?: Api.Worker.TaskStatus
  preset: "24h" | "7d" | "30d" | "custom"
  start: string
  end: string
  page: number
  pageSize: number
  sortBy: "lastExecutedAt" | "total" | "failure"
  sortOrder: "asc" | "desc"
}

export function timeRange(preset: "24h" | "7d" | "30d", now = Date.now()) {
  return {
    start: new Date(now - { "24h": 1, "7d": 7, "30d": 30 }[preset] * 86400000).toISOString(),
    end: new Date(now).toISOString(),
  }
}

export function readTaskView(query: Record<string, unknown>, now = Date.now()): TaskViewState {
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "")
  const preset = ["24h", "7d", "30d", "custom"].includes(value("range"))
    ? (value("range") as TaskViewState["preset"])
    : "7d"
  const fallback = timeRange(preset === "custom" ? "7d" : preset, now)
  const start = value("startTime"),
    end = value("endTime")
  const valid = validRange(start, end)
  return {
    view: value("view") === "groups" ? "groups" : "records",
    task: value("task"),
    keyword: value("keyword"),
    worker: value("worker"),
    status: ["1", "2", "3", "4", "5", "6"].includes(value("status"))
      ? (value("status") as Api.Worker.TaskStatus)
      : undefined,
    preset,
    start: valid ? start : fallback.start,
    end: valid ? end : fallback.end,
    page:
      Number.isSafeInteger(Number(value("groupPage"))) && Number(value("groupPage")) > 0
        ? Number(value("groupPage"))
        : 1,
    pageSize: [10, 20, 50, 100].includes(Number(value("groupSize"))) ? Number(value("groupSize")) : 10,
    sortBy: ["total", "failure"].includes(value("sortBy"))
      ? (value("sortBy") as TaskViewState["sortBy"])
      : "lastExecutedAt",
    sortOrder: value("sortOrder") === "asc" ? "asc" : "desc",
  }
}

export function validRange(start: string, end: string) {
  const duration = Date.parse(end) - Date.parse(start)
  return Number.isFinite(duration) && duration > 0 && duration <= 90 * 86400000
}

export function writeTaskView(state: TaskViewState) {
  return {
    view: state.view,
    task: state.task || undefined,
    keyword: state.keyword || undefined,
    worker: state.worker || undefined,
    status: state.status,
    range: state.preset,
    startTime: state.start,
    endTime: state.end,
    groupPage: String(state.page),
    groupSize: String(state.pageSize),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
  }
}

export function drillTask(state: TaskViewState, task: string, failure = false): TaskViewState {
  return { ...state, view: "records", task, status: failure ? "4" : undefined }
}

export function refreshTaskRange(state: TaskViewState, now = Date.now()) {
  return state.preset === "custom" ? state : { ...state, ...timeRange(state.preset, now) }
}
