import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"
import { Button } from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { usePluginMonitoring } from "@/services/hooks/use-plugin-monitoring"
import { PageHeader } from "@/features/layout/components/page-header"
import { PluginState } from "./modules/plugin-state"
import { PluginTable } from "./modules/plugin-table"
import { PluginEventTables } from "./modules/plugin-events"
import { PluginDependencyDiagram } from "./modules/plugin-dependency-graph"
function PluginWorkbench() {
  const { t } = useTranslation()
  const monitoring = usePluginMonitoring(),
    q = monitoring.queries
  const plugins = monitoring.plugins ?? []
  const stats = {
    totalPlugins: plugins.length,
    loaded: plugins.filter((p) => p.status === "loaded").length,
    disabled: plugins.filter((p) => p.status === "disabled").length,
    failed: plugins.filter((p) => p.status === "failed").length,
  }
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t("pluginMonitoring.title")} description={t("pluginMonitoring.description")} />
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("datatable.refresh")}
          disabled={monitoring.loading}
          onClick={() => void monitoring.refresh()}
        >
          <RefreshCw className={monitoring.loading ? "animate-spin" : ""} />
        </Button>
      </div>
      <section aria-label={t("pluginMonitoring.summary")} aria-busy={q.plugins.isFetching}>
        <PluginState resource={q.plugins}>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="rounded-lg border bg-card p-5">
                <dt className="text-sm text-muted-foreground">{t(`pluginMonitoring.${key}`)}</dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </PluginState>
      </section>
      <div className="grid min-w-0 gap-4 xl:grid-cols-8">
        <section aria-labelledby="plugin-table-title" className="min-w-0 rounded-lg border bg-card p-4 xl:col-span-5">
          <h2 id="plugin-table-title" className="mb-4 font-semibold">
            {t("pluginMonitoring.pluginList")}
          </h2>
          <PluginState resource={q.plugins} empty={!plugins.length}>
            <PluginTable plugins={plugins} />
          </PluginState>
        </section>
        <figure aria-labelledby="plugin-graph-title" className="min-w-0 rounded-lg border bg-card p-4 xl:col-span-3">
          <figcaption id="plugin-graph-title" className="mb-4 font-semibold">
            {t("pluginMonitoring.depGraph")}
          </figcaption>
          <PluginState resource={q.graph} empty={!monitoring.graph?.nodes.length}>
            {monitoring.graph && (
              <PluginDependencyDiagram key={JSON.stringify(monitoring.graph)} graph={monitoring.graph} />
            )}
          </PluginState>
        </figure>
      </div>
      <section aria-labelledby="plugin-events-title" className="min-w-0 rounded-lg border bg-card p-4">
        <h2 id="plugin-events-title" className="mb-4 font-semibold">
          {t("pluginMonitoring.eventStats")}
        </h2>
        <PluginState resource={q.events}>
          {monitoring.events && <PluginEventTables events={monitoring.events} />}
        </PluginState>
      </section>
    </div>
  )
}
export default function PluginMonitoringPage() {
  useAuthStore((state) => state.token)
  const read = usePermission("plugin:read"),
    { t } = useTranslation()
  return read ? <PluginWorkbench key={getAuthSession()} /> : <p role="alert">{t("error.403")}</p>
}
