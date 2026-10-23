import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  toast,
} from "@rapidkit/ui"
import { useTranslation } from "react-i18next"
import type { Delivery } from "@/services/api/notification-delivery"
import { deliveryErrorKey, deliveryOutcomeTime, deliveryTime } from "./delivery-model"
import { DeliveryMessageView, DeliveryRecipientView } from "./delivery-presentation"
export function DeliveryDetail({
  row,
  canViewMessage,
  onClose,
  onViewMessage,
  onReturn,
}: {
  row: Delivery
  canViewMessage: boolean
  onClose: () => void
  onViewMessage: () => void
  onReturn: () => void
}) {
  const { t } = useTranslation(),
    p = "notificationDelivery.",
    time = deliveryOutcomeTime(row),
    error = ["dead", "retrying"].includes(row.status) ? deliveryErrorKey(row.lastErrorCode) : undefined
  const fields = [
    { key: "deliveryId", value: row.id },
    { key: "messageId", value: row.messageId },
    { key: "userId", value: row.userId },
    { key: "lastErrorCode", value: row.lastErrorCode },
    ...(row.lockedUntil ? [{ key: "lockedUntil", value: deliveryTime(row.lockedUntil) }] : []),
  ]
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t(`${p}copySucceeded`))
    } catch {
      toast.error(t(`${p}copyFailed`))
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="flex min-w-0 flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[550px]">
        <SheetHeader className="border-b p-5">
          <SheetTitle>{t(`${p}detailTitle`)}</SheetTitle>
          <SheetDescription>{t(`${p}inApp`)}</SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-5 overflow-y-auto p-5">
          <section
            aria-label={t(`${p}deliveryStatus`)}
            data-status={row.status}
            className="grid min-w-0 gap-4 rounded-lg border bg-muted/30 p-4"
          >
            <div>
              <h2 className="text-xl font-semibold">{t(`${p}outcome.title.${row.status}`)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(`${p}outcome.description.${row.status}`)}</p>
            </div>
            <dl className="grid gap-3 min-[420px]:grid-cols-[1fr_2fr]">
              <div>
                <dt className="text-xs text-muted-foreground">{t(`${p}attemptCount`)}</dt>
                <dd className="font-semibold">{t(`${p}outcome.attempts`, { count: row.attemptCount })}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t(`${p}${time.label}`)}</dt>
                <dd className="text-sm">{deliveryTime(time.value)}</dd>
              </div>
            </dl>
            {error && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">{t(`${p}errorReason`)}</p>
                <p className="break-words text-sm">{t(`${p}${error}`)}</p>
              </div>
            )}
          </section>
          <section aria-label={t(`${p}recipient`)}>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t(`${p}recipient`)}</h3>
            <DeliveryRecipientView recipient={row.recipient} userId={row.userId} />
          </section>
          <section aria-label={t(`${p}outcome.relatedMessage`)} className="rounded-lg bg-muted/30 p-4">
            <h3 className="mb-3 text-xs text-muted-foreground">
              {t(`${p}outcome.relatedMessage`)} · {t(`${p}inApp`)}
            </h3>
            <DeliveryMessageView message={row.message ?? null} canView={canViewMessage} onView={onViewMessage} />
          </section>
          <dl className="grid gap-3 min-[420px]:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t(`${p}createdAt`)}</dt>
              <dd className="text-sm">{deliveryTime(row.createTime)}</dd>
            </div>
            {!time.isUpdated && (
              <div>
                <dt className="text-xs text-muted-foreground">{t(`${p}updatedAt`)}</dt>
                <dd className="text-sm">{deliveryTime(row.updateTime)}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-muted-foreground">
            {t(`${p}${row.status === "sent" ? "sentHint" : `outcome.hint.${row.status}`}`)}
          </p>
          <details className="min-w-0 border-t pt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">{t(`${p}technicalInfo`)}</summary>
            <div className="mt-4 grid min-w-0 gap-3">
              {fields.map((field) => (
                <div key={field.key} className="min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{t(`${p}${field.key}`)}</span>
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t(`${p}copyField`, { field: t(`${p}${field.key}`) })}
                        onClick={() => {
                          if (field.value) void copy(field.value)
                        }}
                      >
                        {t(`${p}copy`)}
                      </Button>
                    )}
                  </div>
                  <code className="break-all text-xs">{field.value || "—"}</code>
                </div>
              ))}
            </div>
          </details>
        </div>
        <SheetFooter className="flex flex-row justify-end border-t p-4">
          <Button variant="outline" onClick={onClose}>
            {t(`${p}close`)}
          </Button>
          {row.status === "dead" && <Button onClick={onReturn}>{t(`${p}outcome.returnWorkbench`)}</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
