import { Suspense } from "react"
import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { cn } from "@rapidkit/ui/lib/utils"
import { PageHeader } from "@/features/layout/components/page-header"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import type { DashboardCapabilities } from "@/services/api/dashboard"
import { selectDashboardModules } from "./dashboard-registry"
import type { DashboardModule } from "./dashboard-registry"
import { RestrictedHome } from "./modules/restricted-home"

interface DashboardCapabilityQueryState {
  isLoading: boolean
  isError: boolean
  data?: { data: DashboardCapabilities | null; error: unknown }
  refetch: () => unknown
}

export type HomeViewState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => unknown }
  | { kind: "restricted" }
  | { kind: "full"; modules: DashboardModule[]; revision: string }

export function resolveHomeView(query: DashboardCapabilityQueryState): HomeViewState {
  if (query.isLoading) return { kind: "loading" }
  if (query.isError || query.data?.error || !query.data?.data) return { kind: "error", retry: query.refetch }

  const modules = selectDashboardModules(query.data.data.allowedModules)
  if (modules.length === 0) return { kind: "restricted" }
  return { kind: "full", modules, revision: query.data.data.revision }
}

export function HomeDashboard({
  state,
  isRefreshing,
  onRefresh,
  now = new Date(),
}: {
  state: HomeViewState
  isRefreshing: boolean
  onRefresh: () => void
  now?: Date
}) {
  const { i18n, t } = useTranslation()

  if (state.kind === "loading") return <LoadingState label={t("state.loading")} />
  if (state.kind === "error") {
    return <ErrorState message={t("state.error")} onRetry={state.retry} retryLabel={t("state.retry")} />
  }
  if (state.kind === "restricted") return <RestrictedHome />

  const currentDate = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(now)
  const statusLabel = isRefreshing ? t("home.statusRefreshing") : t("home.statusReady")

  return (
    <div>
      <PageHeader
        title={t("home.welcome")}
        description={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5" aria-live="polite">
              <span
                className={cn("size-2 rounded-full", isRefreshing ? "animate-pulse bg-warning" : "bg-success")}
                aria-hidden="true"
              />
              {statusLabel}
            </span>
            <span>{t("home.currentDate", { date: currentDate })}</span>
            <span className="font-mono text-xs">{t("home.revision", { revision: state.revision.slice(0, 8) })}</span>
          </div>
        }
        actions={
          <Button type="button" variant="outline" size="sm" disabled={isRefreshing} onClick={onRefresh}>
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
            {t("home.refresh")}
          </Button>
        }
      />
      <div className="grid grid-cols-24 gap-4">
        {state.modules.map((module) => (
          <div key={module.key} className={module.colSpan}>
            <Suspense fallback={<LoadingState label={t("state.loading")} />}>
              <module.Component />
            </Suspense>
          </div>
        ))}
      </div>
    </div>
  )
}
