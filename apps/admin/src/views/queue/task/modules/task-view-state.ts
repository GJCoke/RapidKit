import type { TaskStatus, TaskQuery, TaskGroupQuery } from "@/services/api/task"
import { parseApiDate } from "@/shared/date-time"
export const taskPageSizes = [20, 50, 100, 500]
export const taskRanges = ["24h", "7d", "30d", "custom"] as const
export const taskSorts = ["lastExecutedAt", "total", "failure"] as const
export const taskStatuses = ["1", "2", "3", "4", "5", "6"] as const
export type TaskRange = (typeof taskRanges)[number]
export interface TaskViewState {
  view: "records" | "groups"
  task: string
  keyword: string
  worker: string
  status?: TaskStatus
  preset: TaskRange
  start: string
  end: string
  page: number
  pageSize: number
  sortBy: (typeof taskSorts)[number]
  sortOrder: "asc" | "desc"
}
export function timeRange(preset: Exclude<TaskRange, "custom">, now = Date.now()) {
  return {
    start: new Date(now - { "24h": 1, "7d": 7, "30d": 30 }[preset] * 86400000).toISOString(),
    end: new Date(now).toISOString(),
  }
}
export function validRange(start: string, end: string) {
  const duration = parseApiDate(end).getTime() - parseApiDate(start).getTime()
  return Number.isFinite(duration) && duration > 0 && duration <= 90 * 86400000
}
export function readTaskView(query: URLSearchParams, now = Date.now()): TaskViewState {
  const value = (key: string) => (query.getAll(key).length === 1 ? (query.get(key) ?? "") : "")
  const preset = taskRanges.find((range) => range === value("range")) ?? "7d",
    fallback = timeRange(preset === "custom" ? "7d" : preset, now),
    start = value("startTime"),
    end = value("endTime"),
    valid = validRange(start, end),
    page = Number(value("groupPage")),
    pageSize = Number(value("groupSize"))
  return {
    view: value("view") === "groups" ? "groups" : "records",
    task: value("task"),
    keyword: value("keyword"),
    worker: value("worker"),
    status: taskStatuses.find((status) => status === value("status")),
    preset,
    start: valid ? parseApiDate(start).toISOString() : fallback.start,
    end: valid ? parseApiDate(end).toISOString() : fallback.end,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: taskPageSizes.includes(pageSize) ? pageSize : 20,
    sortBy: taskSorts.find((sort) => sort === value("sortBy")) ?? "lastExecutedAt",
    sortOrder: value("sortOrder") === "asc" ? "asc" : "desc",
  }
}
export function writeTaskView(state: TaskViewState, existing = new URLSearchParams()) {
  const query = new URLSearchParams(existing),
    values = {
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
  for (const [key, value] of Object.entries(values)) {
    query.delete(key)
    if (value !== undefined) query.set(key, value)
  }
  return query
}
export function applyTaskSearch(active: TaskViewState, draft: TaskViewState, now = Date.now()): TaskViewState {
  return {
    ...active,
    keyword: draft.keyword,
    worker: draft.worker,
    status: draft.status,
    preset: draft.preset,
    start: draft.start,
    end: draft.end,
    ...(draft.preset === "custom" ? {} : timeRange(draft.preset, now)),
    sortBy: draft.sortBy,
    sortOrder: draft.sortOrder,
    page: 1,
  }
}
export function resetTaskSearch(active: TaskViewState, now = Date.now()): TaskViewState {
  return {
    ...active,
    task: "",
    keyword: "",
    worker: "",
    status: undefined,
    preset: "7d",
    ...timeRange("7d", now),
    page: 1,
    sortBy: "lastExecutedAt",
    sortOrder: "desc",
  }
}
export function drillTask(state: TaskViewState, task: string, failure = false): TaskViewState {
  return { ...state, view: "records", task, status: failure ? "4" : undefined }
}
export function taskRecordQuery(state: TaskViewState, pagination: { page: number; pageSize: number }): TaskQuery {
  return {
    ...pagination,
    taskName: state.task || state.keyword || undefined,
    taskNameMatch: state.task ? "exact" : "contains",
    workerHostname: state.worker || undefined,
    status: state.status,
    startTime: state.start,
    endTime: state.end,
  }
}
export function taskGroupQuery(state: TaskViewState): TaskGroupQuery {
  return {
    page: state.page,
    pageSize: state.pageSize,
    taskName: state.keyword || undefined,
    workerHostname: state.worker || undefined,
    startTime: state.start,
    endTime: state.end,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
  }
}
export function refreshTaskRange(state: TaskViewState, now = Date.now()): TaskViewState {
  return state.preset === "custom" ? state : { ...state, ...timeRange(state.preset, now) }
}
