import { useTranslation } from "react-i18next"
import { Switch } from "@rapidkit/ui/components/switch"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useNotificationPreferences } from "@/services/hooks/use-notification-preferences"
import { PageHeader } from "@/features/layout/components/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/features/layout/components/states"
import { translateText } from "@/shared/i18n-text"
function PreferencesPanel() {
  const { t } = useTranslation(),
    state = useNotificationPreferences(),
    p = "notificationPreferences."
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t(`${p}title`)} />
      {state.loading ? (
        <div role="status">
          <LoadingState label={t("common.loading")} />
        </div>
      ) : state.failed ? (
        <ErrorState message={t(`${p}loadFailed`)} onRetry={() => void state.load()} />
      ) : !state.items.length ? (
        <EmptyState message={t("notification.empty")} />
      ) : (
        <section className="grid min-w-0 gap-3 rounded-lg border p-4">
          {state.items.map((item) => {
            const pending = state.isSaving(item.category),
              name = translateText(t, item.nameKey)
            return (
              <div
                key={item.category}
                className="flex min-w-0 items-center justify-between gap-4 rounded-lg border px-4 py-3"
              >
                <div className="grid min-w-0 gap-1">
                  <span className="break-words text-sm font-semibold">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`${p}${!item.closable || item.reserved ? "mandatoryHint" : "optionalHint"}`)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {pending && <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />}
                  <Switch
                    aria-label={name}
                    aria-busy={pending}
                    checked={item.enabled}
                    disabled={!item.closable || item.reserved || pending}
                    onCheckedChange={(enabled) => {
                      void state.toggle(item.category, enabled)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
export default function NotificationPreferencesPage() {
  const token = useAuthStore((state) => state.token)
  return token ? <PreferencesPanel key={getAuthSession()} /> : null
}
