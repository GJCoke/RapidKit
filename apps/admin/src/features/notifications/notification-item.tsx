import { useState } from "react"
import { useTranslation } from "react-i18next"
import dayjs from "dayjs"
import { Badge, Button } from "@rapidkit/ui"
import type { NotificationMessage } from "@/services/api/notification"
import { isNotificationActionable, notificationActionLabel, renderNotification } from "./notification-model"
import { formatNotificationTime } from "./notification-presentation"

const categoryKeys: Record<string, string> = {
  "admin.announcement": "adminAnnouncement",
  "system.security": "systemSecurity",
  "user.invited": "userInvited",
  "user.mention": "userMention",
  "task.completed": "taskCompleted",
}
export function NotificationItem({
  message,
  compact = false,
  now = Date.now(),
  busy,
  onRead,
  onArchive,
  onDelete,
}: {
  message: NotificationMessage
  compact?: boolean
  now?: number
  busy: boolean
  onRead: (message: NotificationMessage, followAction: boolean) => void
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const recalled = message.status === "recalled"
  const { title, content } = renderNotification(message, i18n.language, (key, params) => t(key, params ?? {}))
  const actionable = isNotificationActionable(message)
  const category = categoryKeys[message.category]
    ? t(`notification.category.${categoryKeys[message.category]}`)
    : message.category
  return (
    <article
      aria-label={recalled ? t("notification.recalled") : title}
      className={`grid min-w-0 gap-3 rounded-lg border p-4 ${!message.readAt && !recalled ? "border-primary/25 bg-primary/5" : "bg-card"}`}
    >
      {recalled ? (
        <>
          <p className="text-sm font-medium">{t("notification.recalled")}</p>
          <p className="text-sm text-muted-foreground">{t("notification.recalledContent")}</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={message.level === "error" ? "destructive" : "secondary"}>
              {t(`notification.level.${message.level}`)}
            </Badge>
            {!message.readAt && (
              <span className="size-2 rounded-full bg-primary" aria-label={t("notification.tabs.unread")} />
            )}
            {message.mandatory && <Badge variant="outline">{t("notification.mandatory")}</Badge>}
          </div>
          <button
            type="button"
            className="min-w-0 text-left font-semibold break-words hover:text-primary focus-visible:outline-ring"
            disabled={busy}
            onClick={() => onRead(message, !compact)}
            aria-label={title}
          >
            <span className={compact && !expanded ? "line-clamp-1" : "whitespace-pre-wrap"}>{title}</span>
          </button>
          <p
            className={`whitespace-pre-wrap break-words text-sm text-muted-foreground ${compact && !expanded ? "line-clamp-2" : ""}`}
          >
            {message.status === "expired" ? t("notification.expired") : content}
          </p>
          {compact && (
            <Button
              size="sm"
              variant="ghost"
              className="justify-self-start"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {t(`notification.popover.${expanded ? "collapseContent" : "expandContent"}`)}
            </Button>
          )}
          {compact && actionable && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              className="min-w-0 max-w-full whitespace-normal break-words"
              onClick={() => onRead(message, true)}
            >
              {notificationActionLabel(message.action, i18n.language) || t("notification.popover.openAction")}
            </Button>
          )}
        </>
      )}
      <footer className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 break-words">{category}</span>
        <time dateTime={message.createTime} title={dayjs(message.createTime).format("YYYY-MM-DD HH:mm:ss")}>
          {formatNotificationTime(message.createTime, i18n.language, now, compact)}
        </time>
        {onArchive && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onArchive(message.id)}>
            {t("notification.archive")}
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => onDelete(message.id)}
          >
            {t("notification.delete")}
          </Button>
        )}
      </footer>
    </article>
  )
}
