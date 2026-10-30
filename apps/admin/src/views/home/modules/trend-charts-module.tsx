import { useAuthStore } from "@/stores/auth"
import { platformDateRange } from "@/utils/datetime"
import { useTranslation } from "react-i18next"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { useDashboardTrends } from "@/services/hooks/use-dashboard"
import { mapTrendPoints, platformWallDate, resolveDashboardQueries } from "./dashboard-data"
import { TrendCharts } from "./trend-charts"

export function TrendChartsModule() {
  const { i18n, t } = useTranslation()
  const timezone = useAuthStore((state) => state.userInfo?.timezone || "UTC")
  const query = useDashboardTrends(platformDateRange(new Date(), timezone))
  const state = resolveDashboardQueries([query])

  if (state === "loading") return <LoadingState label={t("state.loading")} />
  if (state === "error") {
    return <ErrorState message={t("state.error")} retryLabel={t("state.retry")} onRetry={() => void query.refetch()} />
  }

  const points = query.data?.data
  if (!points) return <ErrorState message={t("state.error")} />

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { timeZone: "UTC", month: "short", day: "numeric" })
  return (
    <TrendCharts
      title={t("home.userTrend")}
      data={mapTrendPoints(points, (value) => dateFormatter.format(platformWallDate(value)))}
    />
  )
}
