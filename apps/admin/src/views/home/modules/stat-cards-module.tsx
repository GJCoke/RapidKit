import { useTranslation } from "react-i18next"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import {
  useDashboardErrorStats,
  useDashboardTaskSummary,
  useDashboardUserSummary,
  useDashboardWorkers,
} from "@/services/hooks/use-dashboard"
import { createOverviewStats, resolveDashboardQueries } from "./dashboard-data"
import { StatCards } from "./stat-cards"

export function StatCardsModule() {
  const { i18n, t } = useTranslation()
  const users = useDashboardUserSummary()
  const tasks = useDashboardTaskSummary()
  const workers = useDashboardWorkers()
  const errors = useDashboardErrorStats()
  const queries = [users, tasks, workers, errors]
  const state = resolveDashboardQueries(queries)

  if (state === "loading") return <LoadingState label={t("state.loading")} />
  if (state === "error") {
    return (
      <ErrorState
        message={t("state.error")}
        retryLabel={t("state.retry")}
        onRetry={() => void Promise.all(queries.map((query) => query.refetch()))}
      />
    )
  }

  const usersData = users.data?.data
  const tasksData = tasks.data?.data
  const workersData = workers.data?.data
  const errorsData = errors.data?.data
  if (!usersData || !tasksData || !workersData || !errorsData) {
    return <ErrorState message={t("state.error")} />
  }

  const numberFormatter = new Intl.NumberFormat(i18n.language)
  const percentFormatter = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 2 })
  const stats = createOverviewStats(
    { users: usersData, tasks: tasksData, workers: workersData, errors: errorsData },
    (key, params) => t(key, params),
    (value) => numberFormatter.format(value),
    (value) => percentFormatter.format(value),
  )

  return <StatCards stats={stats} />
}
