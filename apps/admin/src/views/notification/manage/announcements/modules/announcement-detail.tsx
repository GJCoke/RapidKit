import { translateText } from "@/shared/i18n-text"
import { parseApiDate } from "@/shared/date-time"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"
import { Badge, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@rapidkit/ui"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { renderNotification } from "@/features/notifications/notification-model"
import { useAnnouncementDetail } from "@/services/hooks/use-announcements"
import { announcementCategoryText, announcementStatusText } from "./announcement-presentation"
export function AnnouncementDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, i18n } = useTranslation(),
    query = useAnnouncementDetail(id)
  const data = query.data,
    text = data ? renderNotification(data, i18n.language, (key, params) => translateText(t, key, params)) : null
  const date = (value?: string | null) =>
    value ? dayjs(parseApiDate(value)).format("YYYY-MM-DD HH:mm") : t("announcement.banner.unlimited")
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-[680px]">
        <SheetHeader>
          <SheetTitle>{t("announcement.banner.detailTitle")}</SheetTitle>
          <SheetDescription>{data?.category ?? t("announcement.pageTitle")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {query.isPending ? (
            <LoadingState label={t("common.loading")} />
          ) : query.isError ? (
            <ErrorState message={t("announcement.editor.loadFailed")} onRetry={() => void query.refetch()} />
          ) : data && text ? (
            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{t(`notification.level.${data.level}`)}</Badge>
                <Badge variant="secondary">
                  {t(`announcement.${data.displayMode === "top_banner" ? "banner.topBanner" : "editor.inApp"}`)}
                </Badge>
                <Badge>{announcementStatusText(data, (key) => t(key))}</Badge>
              </div>
              <h2 className="break-words text-lg font-semibold">{text.title}</h2>
              <p className="whitespace-pre-wrap break-words">{text.content}</p>
              <dl className="grid gap-3 border-t pt-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("announcement.category")}</dt>
                  <dd>
                    {announcementCategoryText(data.category, (key, fallback) => t(key, { defaultValue: fallback }))}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("announcement.banner.startsAt")}</dt>
                  <dd>
                    {data.publishAt || data.publishedAt
                      ? date(data.publishAt ?? data.publishedAt)
                      : t("announcement.table.unpublished")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("announcement.banner.endsAt")}</dt>
                  <dd>{date(data.expireAt)}</dd>
                </div>
                {data.supersededAt && (
                  <div>
                    <dt className="text-muted-foreground">{t("announcement.banner.superseded")}</dt>
                    <dd>{date(data.supersededAt)}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
