import { useTranslation } from "react-i18next"
import { useHomeApi } from "@/services/hooks/use-home-dashboard"
import { MonitoringDistribution, MonitoringTrend } from "@/views/monitoring/api/modules/monitoring-charts"
import { HomeCard, HomeState } from "./home-card"
export function ApiOverviewModule() {
  const { t } = useTranslation(),
    queries = useHomeApi()
  return (
    <HomeCard title={t("homeDashboard.apiOverview")}>
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <figure className="min-w-0" aria-label={t("homeDashboard.apiDistribution")}>
          <figcaption className="mb-3 text-sm font-medium">{t("homeDashboard.apiDistribution")}</figcaption>
          <HomeState query={queries.distribution} empty={queries.distribution.data?.length === 0}>
            {queries.distribution.data && <MonitoringDistribution data={queries.distribution.data} />}
          </HomeState>
        </figure>
        <section className="min-w-0">
          <h3 className="mb-3 text-sm font-medium">{t("homeDashboard.apiTopFailures")}</h3>
          <HomeState query={queries.top} empty={queries.top.data?.length === 0}>
            <ol className="space-y-2">
              {queries.top.data?.slice(0, 5).map((item) => (
                <li
                  key={`${item.method}:${item.path}`}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-xs"
                >
                  <span className="font-semibold">{item.method}</span>
                  <span className="min-w-0 flex-1 break-all font-mono">{item.path}</span>
                  <strong className="text-destructive">{item.errorCount}</strong>
                  <span>{item.errorRate}%</span>
                </li>
              ))}
            </ol>
          </HomeState>
        </section>
        <figure className="min-w-0" aria-label={t("homeDashboard.apiTrend24h")}>
          <figcaption className="mb-3 text-sm font-medium">{t("homeDashboard.apiTrend24h")}</figcaption>
          <HomeState query={queries.trend} empty={queries.trend.data?.length === 0}>
            {queries.trend.data && <MonitoringTrend data={queries.trend.data} />}
          </HomeState>
        </figure>
      </div>
    </HomeCard>
  )
}
