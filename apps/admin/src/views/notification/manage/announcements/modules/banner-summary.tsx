import { parseApiDate } from "@/shared/date-time"
import type { ReactNode } from "react"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"
import { Badge } from "@rapidkit/ui"
import { renderNotification } from "@/features/notifications/notification-model"
import type { AnnouncementBannerCheck } from "@/services/api/announcement"
type BannerItem = NonNullable<AnnouncementBannerCheck["current"]>
export function BannerSummary({
  check,
  delivery,
  messageId,
  confirmation = false,
  actions,
}: {
  check: AnnouncementBannerCheck
  delivery?: "now" | "scheduled"
  messageId?: string | null
  confirmation?: boolean
  actions?: (kind: "current" | "scheduled", item: BannerItem) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const date = (value?: string | null) =>
    value ? dayjs(parseApiDate(value)).format("YYYY-MM-DD HH:mm") : t("announcement.banner.unlimited")
  return (
    <div className="grid gap-3">
      <div className={`grid gap-3 ${confirmation ? "" : "md:grid-cols-2"}`}>
        {(["current", "scheduled"] as const).map((kind) => {
          const item = check[kind],
            heading = kind === "current" ? "current" : "upcoming"
          const text = item ? renderNotification(item, i18n.language, (key, params) => t(key, params ?? {})) : null
          return (
            <section
              key={kind}
              aria-label={t(`announcement.banner.${heading}`)}
              className="grid min-w-0 gap-3 overflow-hidden rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{t(`announcement.banner.${heading}`)}</h3>
                {item && !confirmation && (
                  <Badge variant="secondary">
                    {t(`announcement.banner.${kind === "current" ? "active" : "scheduled"}`)}
                  </Badge>
                )}
              </div>
              {item && text ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="break-words text-sm font-medium">{text.title}</h4>
                    <Badge variant="outline">{t(`notification.level.${item.level}`)}</Badge>
                  </div>
                  {!confirmation && (
                    <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {text.content}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">{t("announcement.banner.startsAt")}</dt>
                      <dd>{date(item.publishAt ?? item.publishedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("announcement.banner.endsAt")}</dt>
                      <dd>{date(item.expireAt)}</dd>
                    </div>
                  </dl>
                  {!confirmation && actions && (
                    <div className="flex flex-wrap justify-end gap-2 border-t pt-3">{actions(kind, item)}</div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm">
                    {t(`announcement.banner.${kind === "current" ? "noneCurrent" : "noneUpcoming"}`)}
                  </p>
                  {!confirmation && (
                    <p className="text-xs text-muted-foreground">
                      {t(`announcement.banner.${kind === "current" ? "emptyCurrentHint" : "emptyUpcomingHint"}`)}
                    </p>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>
      {confirmation && (
        <div role="note" className="grid gap-2 rounded-lg border p-3 text-sm">
          <p>
            {t(
              `announcement.banner.${delivery === "now" ? (check.current ? "replaceNowWarning" : "publishNowHint") : "scheduleReplaceWarning"}`,
            )}
          </p>
          {delivery === "now" && check.scheduled && <p>{t("announcement.banner.keepUpcomingWarning")}</p>}
          {delivery === "scheduled" && check.scheduled && check.scheduled.id !== messageId && (
            <p>{t("announcement.banner.replaceUpcomingWarning")}</p>
          )}
          <p>{t("announcement.banner.noRestore")}</p>
        </div>
      )}
    </div>
  )
}
