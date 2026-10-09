import { timeRange, type TaskViewState } from "./task-view-state"

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
    page: 1,
    keyword: "",
    worker: "",
    status: undefined,
    preset: "7d",
    ...timeRange("7d", now),
    sortBy: "lastExecutedAt",
    sortOrder: "desc",
  }
}
