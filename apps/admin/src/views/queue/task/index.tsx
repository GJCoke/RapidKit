import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Input, toast } from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useTaskGroups, useTaskRecords, useTaskOperations, taskAccess } from "@/services/hooks/use-tasks"
import { FormSelect } from "@/shared/crud/form-select"
import { ConfirmActionDialog } from "@/shared/crud/confirm-action-dialog"
import { useTaskView } from "./modules/use-task-view"
import {
  applyTaskSearch,
  resetTaskSearch,
  refreshTaskRange,
  taskGroupQuery,
  taskRanges,
  taskSorts,
  taskStatuses,
  timeRange,
  validRange,
  writeTaskView,
  drillTask,
} from "./modules/task-view-state"
import { statusNames, taskTime, dateTimeInput, inputInstant } from "./modules/task-presentation"
import { TaskRecordsTable, TaskGroupsTable } from "./modules/task-tables"
import { TaskDetailDrawer } from "./modules/task-detail"
import { TriggerDialog } from "./modules/trigger-dialog"
function TaskWorkbench() {
  const { t, i18n } = useTranslation(),
    { state, draft, setDraft, update } = useTaskView(),
    [revision, setRevision] = useState(0),
    [detail, setDetail] = useState<string | null>(null),
    [trigger, setTrigger] = useState(false),
    [confirmation, setConfirmation] = useState<string | null>(null),
    [operationFailed, setOperationFailed] = useState(false),
    [rangeFailed, setRangeFailed] = useState(false),
    canRevoke = usePermission("task:revoke"),
    canTrigger = usePermission("task:trigger"),
    canGroups = usePermission("task:stats"),
    session = getAuthSession()
  const resetKey = JSON.stringify([
      state.view,
      revision,
      state.task,
      state.keyword,
      state.worker,
      state.status,
      state.preset,
      ...(state.preset === "custom" ? [state.start, state.end] : []),
    ]),
    [pagination, setPagination] = useState({ resetKey, page: 1, pageSize: 20 })
  if (pagination.resetKey !== resetKey) setPagination({ ...pagination, resetKey, page: 1 })
  const page = pagination.resetKey === resetKey ? pagination.page : 1,
    records = useTaskRecords(state, { page, pageSize: pagination.pageSize }, state.view === "records"),
    groups = useTaskGroups(taskGroupQuery(state), state.view === "groups"),
    operations = useTaskOperations(records.key),
    active = state.view === "records" ? records : groups
  useEffect(() => {
    if (!canRevoke) {
      setConfirmation(null)
      setOperationFailed(false)
    }
  }, [canRevoke])
  useEffect(() => {
    if (!canTrigger) setTrigger(false)
  }, [canTrigger])
  function refresh() {
    const next = refreshTaskRange(state)
    if (writeTaskView(next).toString() === writeTaskView(state).toString()) void active.refetch()
    else update(next)
  }
  function search(reset = false) {
    const values = reset ? resetTaskSearch(state) : draft
    if (!validRange(values.start, values.end)) {
      setRangeFailed(true)
      return
    }
    setRangeFailed(false)
    const next = applyTaskSearch(reset ? { ...state, task: "" } : state, values)
    if (reset) setDraft(next)
    if (writeTaskView(next).toString() === writeTaskView(state).toString() && (state.view === "groups" || page === 1))
      void active.refetch()
    update(next)
    setRevision((value) => value + 1)
  }
  function back() {
    update({ ...state, view: "groups", task: "", status: undefined })
    setDraft({ ...draft, status: undefined })
    setConfirmation(null)
  }
  async function revoke() {
    if (!confirmation) return
    const id = confirmation
    setConfirmation(null)
    setOperationFailed(false)
    const accepted = await operations.revoke(id)
    if (!taskAccess("task:read", session) || !taskAccess("task:revoke", session)) return
    if (accepted) toast.success(t("task.revokeSuccess"))
    else setOperationFailed(true)
  }
  return (
    <div className="grid min-w-0 gap-4">
      <section aria-label={t("common.search")} className="min-w-0 space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={state.view === "records" ? "default" : "outline"}
            onClick={() => update({ ...state, view: "records" })}
          >
            {t("task.recordsView")}
          </Button>
          {canGroups && (
            <Button type="button" variant={state.view === "groups" ? "default" : "outline"} onClick={back}>
              {t("task.groupsView")}
            </Button>
          )}
        </div>
        <form
          className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            search()
          }}
        >
          <label className="grid min-w-0 gap-1 text-sm">
            {t("task.rangeLabel")}
            <FormSelect
              label={t("task.rangeLabel")}
              value={draft.preset}
              options={taskRanges.map((value) => ({ value, label: t(`task.range${value}`) }))}
              onChange={(next) => {
                const preset = taskRanges.find((value) => value === next)
                if (preset) setDraft({ ...draft, preset, ...(preset === "custom" ? {} : timeRange(preset)) })
              }}
            />
          </label>
          {draft.preset === "custom" && (
            <>
              {(["start", "end"] as const).map((key) => (
                <label key={key} className="grid min-w-0 gap-1 text-sm">
                  {t(`task.${key}Label`)}
                  <Input
                    type="datetime-local"
                    step="1"
                    aria-label={t(`task.${key}Label`)}
                    value={dateTimeInput(draft[key])}
                    onChange={(event) => setDraft({ ...draft, [key]: inputInstant(event.target.value) })}
                  />
                </label>
              ))}
            </>
          )}
          <label className="grid min-w-0 gap-1 text-sm">
            {t("task.taskName")}
            <Input
              aria-label={t("task.taskName")}
              placeholder={t("task.form.taskName")}
              value={draft.keyword}
              disabled={Boolean(state.task)}
              onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            {t("task.workerHostname")}
            <Input
              aria-label={t("task.workerHostname")}
              value={draft.worker}
              placeholder={t("task.form.workerHostname")}
              onChange={(event) => setDraft({ ...draft, worker: event.target.value })}
            />
          </label>
          {state.view === "records" ? (
            <label className="grid min-w-0 gap-1 text-sm">
              {t("task.taskStatus")}
              <FormSelect
                label={t("task.taskStatus")}
                value={draft.status ?? ""}
                options={[
                  { value: "", label: t("task.form.status") },
                  ...taskStatuses.map((value) => ({ value, label: t(`task.taskStatusMaps.${statusNames[value]}`) })),
                ]}
                onChange={(next) => setDraft({ ...draft, status: taskStatuses.find((value) => value === next) })}
              />
            </label>
          ) : (
            <>
              <label className="grid min-w-0 gap-1 text-sm">
                {t("task.sortLabel")}
                <FormSelect
                  label={t("task.sortLabel")}
                  value={draft.sortBy}
                  options={taskSorts.map((value) => ({ value, label: t(`task.sort${value}`) }))}
                  onChange={(next) => {
                    const sortBy = taskSorts.find((value) => value === next)
                    if (sortBy) setDraft({ ...draft, sortBy })
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="self-end"
                onClick={() => setDraft({ ...draft, sortOrder: draft.sortOrder === "desc" ? "asc" : "desc" })}
              >
                {t(draft.sortOrder === "desc" ? "task.sortDescending" : "task.sortAscending")}
              </Button>
            </>
          )}
          <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2 xl:col-span-4">
            <Button type="button" variant="outline" onClick={() => search(true)}>
              {t("common.reset")}
            </Button>
            <Button type="submit">{t("common.search")}</Button>
          </div>
        </form>
        {rangeFailed && (
          <p role="alert" className="text-sm text-destructive">
            {t("task.invalidTimeRange")}
          </p>
        )}
        {state.view === "groups" && <p className="text-xs text-muted-foreground">{t("task.groupCountingHint")}</p>}
        <p className="text-xs text-muted-foreground">
          {taskTime(state.start, i18n.language)} – {taskTime(state.end, i18n.language)}
        </p>
        {state.task && state.view === "records" && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={back}>
              {t("task.backToGroups")}
            </Button>
            <code className="min-w-0 wrap-anywhere text-sm">{state.task}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => update({ ...state, task: "" })}>
              {t("task.clearExactTask")}
            </Button>
          </div>
        )}
      </section>
      <section className="min-w-0 space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t(state.view === "records" ? "task.taskStream" : "task.groupsView")}</h2>
          <div className="flex flex-wrap gap-2">
            {state.view === "records" && canTrigger && (
              <Button type="button" variant="outline" onClick={() => setTrigger(true)}>
                {t("task.triggerTask")}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={active.isFetching} onClick={refresh}>
              {t("task.refresh")}
            </Button>
          </div>
        </header>
        {operationFailed && (
          <p role="alert" className="text-sm text-destructive">
            {t("task.operationFailed")}
          </p>
        )}
        {state.view === "records" ? (
          <TaskRecordsTable
            rows={records.data?.records ?? []}
            page={page}
            pageSize={pagination.pageSize}
            total={records.data?.total ?? 0}
            loading={records.isFetching}
            error={records.isError}
            onRetry={() => void records.refetch()}
            onPage={(page) => {
              setConfirmation(null)
              setPagination({ ...pagination, page })
            }}
            onSize={(pageSize) => {
              setConfirmation(null)
              setPagination({ ...pagination, pageSize, page: 1 })
            }}
            canRevoke={canRevoke}
            onDetail={setDetail}
            onRevoke={setConfirmation}
            isPending={operations.revokePending}
          />
        ) : (
          <TaskGroupsTable
            rows={groups.data?.records ?? []}
            page={state.page}
            pageSize={state.pageSize}
            total={groups.data?.total ?? 0}
            loading={groups.isFetching}
            error={groups.isError}
            onRetry={() => void groups.refetch()}
            onPage={(page) => update({ ...state, page })}
            onSize={(pageSize) => update({ ...state, pageSize, page: 1 })}
            onDrill={(name, failure) => {
              const next = drillTask(state, name, failure)
              update(next)
              setDraft({ ...draft, status: next.status })
            }}
          />
        )}
      </section>
      {detail && <TaskDetailDrawer key={detail} id={detail} onClose={() => setDetail(null)} />}{" "}
      {trigger && canTrigger && <TriggerDialog onClose={() => setTrigger(false)} onSubmitted={refresh} />}
      <ConfirmActionDialog
        open={Boolean(confirmation) && canRevoke}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
        title={t("task.revokeTask")}
        description={t("task.revokeConfirm")}
        pending={Boolean(confirmation && operations.revokePending(confirmation))}
        confirmLabel={t("common.confirm")}
        onConfirm={() => void revoke()}
      />
    </div>
  )
}
export default function TaskPage() {
  useAuthStore((state) => state.token)
  const read = usePermission("task:read")
  return read ? <TaskWorkbench key={getAuthSession()} /> : null
}
