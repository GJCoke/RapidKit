import { Badge } from "@rapidkit/ui"
import { useTranslation } from "react-i18next"
import { parseApiDate } from "@/shared/date-time"
import type { TaskStatus } from "@/services/api/task"
export const statusNames = {
  "1": "pending",
  "2": "started",
  "3": "success",
  "4": "failure",
  "5": "retry",
  "6": "revoked",
} as const
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant={status === "4" ? "destructive" : status === "1" || status === "6" ? "outline" : "secondary"}
      className={
        status === "3"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : status === "5"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            : ""
      }
    >
      {t(`task.taskStatusMaps.${statusNames[status]}`)}
    </Badge>
  )
}
export function taskTime(value: string | null | undefined, locale: string) {
  if (!value) return "—"
  const date = parseApiDate(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale)
}
export function dateTimeInput(value: string) {
  const date = parseApiDate(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}
/** A user-edited local date explicitly becomes an instant. Untouched instants retain their offset across DST. */
export function inputInstant(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}
