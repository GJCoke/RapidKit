import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Megaphone } from "lucide-react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  toast,
} from "@rapidkit/ui"
import { useRouteStore } from "@/stores/route"
import type { TopBanner } from "@/services/api/notification"
import { useNotificationBanner } from "@/services/hooks/use-notification-banner"
import { renderNotification, notificationActionLabel, resolveNotificationAction } from "./notification-model"

const levelColors = {
  info: "bg-primary/10",
  success: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  error: "bg-destructive/10 text-destructive",
}

function BannerNotice({ item }: { item: NonNullable<TopBanner["current"]> }) {
  const { t, i18n } = useTranslation(),
    navigate = useNavigate()
  const [details, setDetails] = useState(false)
  const text = renderNotification(item, i18n.language, (key, params) => t(key, params ?? {}))
  const openAction = async () => {
    const destination = resolveNotificationAction(item.action, useRouteStore.getState().snapshot)
    if (!destination) {
      toast.warning(t("notification.actionUnavailable"))
      return
    }
    if (destination.external) window.open(destination.href, "_blank", "noopener,noreferrer")
    else await navigate(destination.href)
    setDetails(false)
  }
  return (
    <>
      <section
        role="region"
        aria-label={t("notification.banner.topBanner")}
        className={`flex min-w-0 items-center gap-3 border-b px-4 py-2 text-sm ${levelColors[item.level]}`}
      >
        <Megaphone className="size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-medium sm:truncate">{text.title}</p>
          <p className="hidden truncate text-muted-foreground sm:block">{text.content}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setDetails(true)}>
          {t("notification.banner.viewDetails")}
        </Button>
      </section>
      <Dialog open={details} onOpenChange={setDetails}>
        <DialogContent className="sm:max-w-xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("notification.banner.detailTitle")}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap break-words">{text.title}</DialogDescription>
          </DialogHeader>
          <p className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words">{text.content}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>{t("notification.close")}</DialogClose>
            {item.action && (
              <Button onClick={() => void openAction()}>
                {notificationActionLabel(item.action, i18n.language) || t("notification.banner.openAction")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
export function GlobalAnnouncement() {
  const banner = useNotificationBanner()
  return banner.current ? <BannerNotice key={banner.current.id} item={banner.current} /> : null
}
