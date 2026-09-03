import { useTranslation } from "react-i18next"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { useDashboardTrends } from "@/services/hooks/use-dashboard"
import { mapTrendPoints, resolveDashboardQueries } from "./dashboard-data"
import { TrendCharts } from "./trend-charts"

function formatDateOnly(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getTrendParams(now = new Date()) {
  const start = new Date(now)
  start.setDate(start.getDate() - 29)
  return { start: formatDateOnly(start), end: formatDateOnly(now), granularity: "day" as const }
}

export function TrendChartsModule() {
  const { i18n, t } = useTranslation()
  const query = useDashboardTrends(getTrendParams())
  const state = resolveDashboardQueries([query])

  if (state === "loading") return <LoadingState label={t("state.loading")} />
  if (state === "error") {
    return <ErrorState message={t("state.error")} retryLabel={t("state.retry")} onRetry={() => void query.refetch()} />
  }

  const points = query.data?.data
  if (!points) return <ErrorState message={t("state.error")} />

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" })
  return (
    <TrendCharts
      title={t("home.userTrend")}
      data={mapTrendPoints(points, (value) => dateFormatter.format(new Date(value)))}
    />
  )
}
