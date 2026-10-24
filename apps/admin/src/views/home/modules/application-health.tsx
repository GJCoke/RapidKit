import { useTranslation } from "react-i18next"
import { useHomeHealth, useHomeBusiness, useHomeCapabilities } from "@/services/hooks/use-home-dashboard"
import { HomeCard, HomeState } from "./home-card"
function BusinessMetrics() {
  const { t, i18n } = useTranslation(),
    query = useHomeBusiness(),
    data = query.data
  return (
    <HomeState query={query}>
      {data && (
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {(["roles", "menus", "routers", "schedules"] as const).map((key) => (
            <div key={key}>
              <dt className="text-muted-foreground">{t(`homeDashboard.${key === "routers" ? "apiRouters" : key}`)}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {new Intl.NumberFormat(i18n.language).format(data[key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </HomeState>
  )
}
export function ApplicationHealthModule() {
  const { t } = useTranslation(),
    query = useHomeHealth(),
    caps = useHomeCapabilities()
  const business = caps.data?.data?.allowedModules.includes("dashboard.business") === true
  const data = query.data
  const rows = data
    ? [
        { key: "qps", label: "QPS", value: data.qps, tip: "qpsTip" },
        { key: "p50", label: "P50", value: `${data.p50Ms}ms`, tip: "p50Tip" },
        { key: "p95", label: "P95", value: `${data.p95Ms}ms`, tip: "p95Tip" },
        { key: "http5xx", label: t("homeDashboard.http5xx"), value: data.http5Xx1H, tip: "http5xxTip" },
        { key: "bizErrors", label: t("homeDashboard.bizErrors"), value: data.bizErrors1H, tip: "bizErrorsTip" },
      ]
    : []
  return (
    <HomeCard
      title={t("homeDashboard.appStatus")}
      actions={
        data && (
          <span className={data.http5Xx1H === 0 && data.bizErrors1H === 0 ? "text-success" : "text-warning"}>
            {t(data.http5Xx1H === 0 && data.bizErrors1H === 0 ? "homeDashboard.healthy" : "homeDashboard.degraded")}
          </span>
        )
      }
    >
      <HomeState query={query}>
        <dl className="divide-y">
          {rows.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <dt className="font-medium">{row.label}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{t(`homeDashboard.${row.tip}`)}</dd>
              </div>
              <dd className="shrink-0 font-semibold tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </HomeState>
      {business && (
        <section className="mt-3 border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold">{t("homeDashboard.businessScale")}</h3>
          <BusinessMetrics />
        </section>
      )}
    </HomeCard>
  )
}
export function BusinessModule() {
  const { t } = useTranslation()
  return (
    <HomeCard title={t("homeDashboard.businessData")}>
      <BusinessMetrics />
    </HomeCard>
  )
}
