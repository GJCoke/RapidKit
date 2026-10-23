import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Bell } from "lucide-react"
import dayjs from "dayjs"
import { Badge, Button, Popover, PopoverContent, PopoverTrigger, Tabs, TabsList, TabsTrigger } from "@rapidkit/ui"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useNotificationInbox, useNotificationUnread } from "@/services/hooks/use-notifications"
import { EmptyState, ErrorState, LoadingState } from "@/features/layout/components/states"
import { useNotificationOperations } from "./use-notification-operations"
import { NotificationItem } from "./notification-item"

function MessagePopover() {
  const { t, i18n } = useTranslation(),
    navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [open])
  const [tab, setTab] = useState("all")
  const inbox = useNotificationInbox(
    tab === "unread" ? { unreadOnly: true } : tab === "announcement" ? { category: "admin.announcement" } : {},
    open,
  )
  const unread = useNotificationUnread(),
    operations = useNotificationOperations()
  const count = unread.data?.count ?? 0,
    badge = count > 99 ? "99+" : String(count)
  const groups = new Map<string, typeof inbox.items>()
  for (const item of [...inbox.items].sort((a, b) => Date.parse(b.createTime) - Date.parse(a.createTime))) {
    const date = dayjs(item.createTime).format("YYYY-MM-DD")
    groups.set(date, [...(groups.get(date) ?? []), item])
  }
  const groupLabel = (date: string) =>
    dayjs(date).isSame(dayjs(now), "day")
      ? t("notification.popover.today")
      : dayjs(date).isSame(dayjs(now).subtract(1, "day"), "day")
        ? t("notification.popover.yesterday")
        : dayjs(date).isValid()
          ? new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "short", day: "numeric" }).format(
              dayjs(date).toDate(),
            )
          : t("notification.popover.other")
  const busy = operations.mutation.isPending || inbox.isFetching
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (value) setNow(Date.now())
      }}
    >
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="icon" className="relative" />}
        aria-label={t("notification.title")}
      >
        <Bell className="size-4" aria-hidden />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 min-w-4 px-1 text-[10px]" aria-live="polite">
            {badge}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(400px,calc(100vw-24px))] gap-3 p-3"
        aria-label={t("notification.popover.title")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("notification.popover.title")}</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={!count || operations.mutation.isPending}
            onClick={() => void operations.perform({ type: "read-all" })}
          >
            {t("notification.readAll")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t("notification.popover.unreadCount", { count, displayCount: badge })}
        </p>
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList className="w-full">
            {["all", "unread", "announcement"].map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`notification.tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div
          className="grid max-h-[min(500px,calc(100dvh-260px))] gap-3 overflow-auto overscroll-contain"
          aria-busy={inbox.isFetching}
        >
          {inbox.isPending ? (
            <LoadingState label={t("common.loading")} />
          ) : inbox.isError ? (
            <ErrorState message={t("notification.loadFailed")} onRetry={() => void inbox.refetch()} />
          ) : !inbox.items.length ? (
            <EmptyState message={t("notification.empty")} />
          ) : (
            [...groups].map(([date, items]) => (
              <section key={date} className="grid min-w-0 gap-2">
                <h3 className="text-xs text-muted-foreground">{groupLabel(date)}</h3>
                {items.map((message) => (
                  <NotificationItem
                    key={message.id}
                    message={message}
                    compact
                    now={now}
                    busy={busy}
                    onRead={(item, follow) => {
                      void operations.read(item, follow).then((navigated) => {
                        if (navigated) setOpen(false)
                      })
                    }}
                  />
                ))}
              </section>
            ))
          )}
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false)
            void navigate("/notification/center")
          }}
        >
          {t("notification.popover.viewAll")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
export function NotificationMessages() {
  const token = useAuthStore((state) => state.token)
  return token ? <MessagePopover key={getAuthSession()} /> : null
}
