import { Activity, ServerCog, TriangleAlert, UserRoundCheck, UsersRound } from "lucide-react"
import type { ActivityItem, DashboardOverviewData, UserActivityTrend } from "@/services/api/dashboard"
import type { Stat } from "./stat-cards"

type Translate = (key: string, params?: Record<string, unknown>) => string

interface DashboardQueryState {
  isPending: boolean
  isError: boolean
  data?: { data: unknown; error: unknown }
}

export function resolveDashboardQueries(queries: readonly DashboardQueryState[]) {
  if (queries.some((query) => query.isError || query.data?.error)) return "error"
  if (queries.some((query) => query.isPending || !query.data || query.data.data === null)) return "loading"
  return "ready"
}

export function createOverviewStats(
  data: DashboardOverviewData,
  translate: Translate,
  formatNumber: (value: number) => string,
  formatPercent: (value: number) => string,
): Stat[] {
  const onlineWorkers = data.workers.filter((worker) => worker.status === "1").length

  return [
    {
      label: translate("home.userTotal"),
      value: formatNumber(data.users.total),
      delta: translate("home.todayNew", { count: formatNumber(data.users.todayNew) }),
      icon: UsersRound,
      tone: "info",
    },
    {
      label: translate("home.onlineUsers"),
      value: formatNumber(data.users.onlineCount),
      icon: UserRoundCheck,
      tone: "success",
    },
    {
      label: translate("home.workerCount"),
      value: formatNumber(onlineWorkers),
      icon: ServerCog,
      tone: "warning",
    },
    {
      label: translate("home.todayTasks"),
      value: formatNumber(data.tasks.total),
      delta: translate("home.taskSuccess", { count: formatNumber(data.tasks.success) }),
      icon: Activity,
      tone: "info",
    },
    {
      label: translate("home.apiErrorRate"),
      value: formatPercent(data.errors.errorRate / 100),
      icon: TriangleAlert,
      tone: "destructive",
    },
  ]
}

export function mapTrendPoints(points: readonly UserActivityTrend[], formatDate: (value: string) => string) {
  return points.map((point) => ({ name: formatDate(point.timeBucket), value: point.newUsers }))
}

const ACTIVITY_KEY_PREFIX = "page.home.dashboard.activity."

export function mapActivityItems(
  items: readonly ActivityItem[],
  translate: Translate,
  formatTime: (value: string) => string,
) {
  return items.map((item) => ({
    id: item.id,
    title: translate(
      item.titleKey.startsWith(ACTIVITY_KEY_PREFIX)
        ? `home.activity.${item.titleKey.slice(ACTIVITY_KEY_PREFIX.length)}`
        : "home.activity.unknown",
      item.titleParams,
    ),
    time: formatTime(item.occurredAt),
  }))
}
