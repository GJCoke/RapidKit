import { Suspense } from "react"
import { useTranslation } from "react-i18next"
import { PageHeader } from "@/features/layout/components/page-header"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { useDashboardCapabilities } from "@/services/hooks/use-dashboard"
import { selectDashboardModules } from "./dashboard-registry"
import { RestrictedHome } from "./modules/restricted-home"

export default function HomePage() {
  const { t } = useTranslation()
  const query = useDashboardCapabilities()

  if (query.isLoading) {
    return <LoadingState label={t("state.loading")} />
  }

  if (query.isError || query.data?.error) {
    return (
      <ErrorState
        message={t("state.error")}
        onRetry={() => query.refetch()}
        retryLabel={t("state.retry")}
      />
    )
  }

  const grantedModules = selectDashboardModules(query.data?.data.allowedModules ?? [])

  if (grantedModules.length === 0) {
    return <RestrictedHome />
  }

  return (
    <div>
      <PageHeader title={t("home.welcome")} />
      <div className="grid grid-cols-24 gap-4">
        {grantedModules.map((module) => (
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
