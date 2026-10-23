import type { TaskDetail, TaskRecord } from "@/services/api/task"
export function taskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    taskId: "task-one",
    taskName: "job",
    status: "1",
    workerHostname: "worker@host",
    runtime: null,
    startedAt: null,
    finishedAt: null,
    retries: 0,
    createTime: "2026-10-24T00:00:00Z",
    updateTime: "2026-10-24T00:00:00Z",
    ...overrides,
  }
}
export function taskDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...taskRecord(),
    args: [null, true, ["nested"]],
    kwargs: { option: { value: 2 } },
    result: { ok: true },
    exception: null,
    traceback: null,
    logs: "ready\nfinished\n",
    ...overrides,
  }
}
