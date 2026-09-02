import { useTranslation } from "react-i18next"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { useDashboardActivities } from "@/services/hooks/use-dashboard"
import { ActivityFeed } from "./activity-feed"
import { mapActivityItems, resolveDashboardQueries } from "./dashboard-data"

export function ActivityFeedModule() {
  const { i18n, t } = useTranslation()
  const query = useDashboardActivities()
  const state = resolveDashboardQueries([query])

  if (state === "loading") return <LoadingState label={t("state.loading")} />
  if (state === "error") {
    return (
      <ErrorState
        message={t("state.error")}
        retryLabel={t("state.retry")}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const page = query.data?.data
  if (!page) return <ErrorState message={t("state.error")} />

  const timeFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" })
  return (
    <ActivityFeed
      items={mapActivityItems(
        page.items,
        (key, params) => t(key, params),
        (value) => timeFormatter.format(new Date(value)),
      )}
    />
  )
}
