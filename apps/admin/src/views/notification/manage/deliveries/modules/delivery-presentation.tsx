import { Badge, Button } from "@rapidkit/ui"
import { Avatar, AvatarImage, AvatarFallback } from "@rapidkit/ui/components/avatar"
import { useTranslation } from "react-i18next"
import type { Delivery, DeliveryMessage, DeliveryRecipient } from "@/services/api/notification-delivery"
import { translateText } from "@/shared/i18n-text"
import { announcementCategoryText } from "../../announcements/modules/announcement-presentation"
import {
  deliveryRecipientName,
  deliveryRecipientSubtitle,
  deliveryMessageTitle,
  deliveryTime,
  deliveryErrorKey,
} from "./delivery-model"
export function DeliveryRecipientView({ recipient, userId }: { recipient?: DeliveryRecipient | null; userId: string }) {
  const { t } = useTranslation(),
    name = deliveryRecipientName(recipient, (key) => t(`notificationDelivery.${key}`)),
    subtitle = deliveryRecipientSubtitle(recipient)
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9 shrink-0">
        <AvatarImage src={recipient?.state === "deleted" ? undefined : (recipient?.avatar ?? undefined)} alt={name} />
        <AvatarFallback>
          {recipient && recipient.state !== "deleted" ? name.slice(0, 1) : userId.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words font-medium">{name}</span>
          {recipient && ["disabled", "pending"].includes(recipient.state) && (
            <Badge variant="secondary">
              {t(`notificationDelivery.${recipient.state === "disabled" ? "userDisabled" : "userPending"}`)}
            </Badge>
          )}
        </div>
        {subtitle && <p className="break-all text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}
export function DeliveryMessageView({
  message,
  canView,
  onView,
}: {
  message: DeliveryMessage | null
  canView: boolean
  onView: () => void
}) {
  const { t, i18n } = useTranslation(),
    p = "notificationDelivery."
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 max-w-full break-words font-medium">
          {message
            ? deliveryMessageTitle(message, i18n.language, (key, params) => translateText(t, key, params))
            : t(`${p}messageUnavailable`)}
        </span>
        {message && canView && (
          <Button type="button" variant="link" size="sm" onClick={onView}>
            {t(`${p}viewMessage`)}
          </Button>
        )}
      </div>
      {message && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {message.category
              ? announcementCategoryText(message.category, (key, fallback) => t(key, { defaultValue: fallback }))
              : t(`${p}unknownCategory`)}
          </span>
          <Badge variant="secondary">{t(`announcement.statusOptions.${message.status}`)}</Badge>
          <span>
            {t(`${p}${message.publishedAt ? "publishedAt" : "createdAt"}`)}{" "}
            {deliveryTime(message.publishedAt || message.createTime)}
          </span>
        </div>
      )}
    </div>
  )
}
export function DeliveryStatus({ status }: { status: Delivery["status"] }) {
  const { t } = useTranslation()
  return (
    <Badge variant={status === "dead" ? "destructive" : status === "sent" ? "default" : "secondary"}>
      {t(`notificationDelivery.status.${status}`)}
    </Badge>
  )
}
export function DeliveryResult({ row }: { row: Delivery }) {
  const { t } = useTranslation(),
    p = "notificationDelivery.",
    error = deliveryErrorKey(row.lastErrorCode)
  return (
    <div className="break-words text-sm">
      <span>{t(error ? `${p}${error}` : `${p}result.${row.status}`)}</span>
      {row.status === "retrying" && row.nextAttemptAt ? (
        <p className="text-xs text-muted-foreground">
          {t(`${p}nextAttemptAt`)} {deliveryTime(row.nextAttemptAt)}
        </p>
      ) : row.status === "sent" && row.sentAt ? (
        <p className="text-xs text-muted-foreground">{deliveryTime(row.sentAt)}</p>
      ) : null}
    </div>
  )
}
