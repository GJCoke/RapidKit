import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import {
  Button,
  Input,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  toast,
} from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import type { WorkerCommand } from "@/services/api/worker"
import type { NormalizedWorker } from "./queue-model"
import { validResize } from "./queue-model"
import { QueueSection } from "./queue-presentation"
export function WorkerControls({
  worker,
  online,
  queues,
  pending,
  onCommand,
}: {
  worker: NormalizedWorker
  online: boolean
  queues: string[]
  pending: boolean
  onCommand: (id: string, command: WorkerCommand) => Promise<boolean>
}) {
  const { t } = useTranslation(),
    canControl = usePermission("worker:control"),
    p = "queueDashboard.",
    [increment, setIncrement] = useState("1"),
    [queue, setQueue] = useState(""),
    [confirmation, setConfirmation] = useState<WorkerCommand | null>(null),
    [failed, setFailed] = useState(false),
    alive = useRef(true),
    lock = useRef(false)
  const enabled = canControl && online && !pending,
    n = increment.trim() ? Number(increment) : null
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const run = async (command: WorkerCommand) => {
    if (!enabled || lock.current) return
    lock.current = true
    setFailed(false)
    try {
      const success = await onCommand(worker.id, command)
      if (!alive.current) return
      setFailed(!success)
      if (success) {
        if (command.type === "add") setQueue("")
        toast.success(t(`${p}${command.type === "ping" ? "control.pingSuccess" : "detail.commandSent"}`))
      }
    } catch {
      if (alive.current) setFailed(true)
    } finally {
      lock.current = false
    }
  }
  if (!canControl) return null
  return (
    <div className="grid min-w-0 gap-3">
      {pending && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {t("common.loading")}
        </p>
      )}
      {!online && (
        <p role="alert" className="rounded-lg border border-amber-500/50 p-3 text-sm">
          {t(`${p}detail.controlsOffline`)}
        </p>
      )}
      {failed && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">
          {t(`${p}detail.commandFailed`)}
        </p>
      )}
      <QueueSection title={t(`${p}detail.connectivity`)} description={t(`${p}detail.pingHint`)}>
        <div className="flex justify-end">
          <Button variant="outline" disabled={!enabled} onClick={() => void run({ type: "ping" })}>
            {t(`${p}control.ping`)}
          </Button>
        </div>
      </QueueSection>
      <QueueSection title={t(`${p}control.poolControl`)} description={t(`${p}detail.poolHint`)}>
        <p className="text-sm">
          {t(`${p}control.currentConcurrency`)} <strong className="ml-2 tabular-nums">{worker.concurrency}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            min={1}
            max={10}
            step={1}
            className="w-28"
            aria-label={t(`${p}control.processCount`)}
            value={increment}
            disabled={!enabled}
            onChange={(event) => setIncrement(event.target.value)}
          />
          <Button
            disabled={!enabled || !validResize(n, worker.concurrency, "grow")}
            onClick={() => {
              if (n !== null) void run({ type: "grow", n })
            }}
          >
            {t(`${p}control.poolGrow`)} +{increment || "—"}
          </Button>
          <Button
            variant="outline"
            disabled={!enabled || !validResize(n, worker.concurrency, "shrink")}
            onClick={() => {
              if (n !== null) setConfirmation({ type: "shrink", n })
            }}
          >
            {t(`${p}control.poolShrink`)} −{increment || "—"}
          </Button>
        </div>
      </QueueSection>
      <QueueSection title={t(`${p}detail.subscriptions`)} description={t(`${p}detail.subscriptionHint`)}>
        {queues.length ? (
          <div className="grid min-w-0 gap-2">
            {queues.map((name) => (
              <div key={name} className="flex min-w-0 items-center justify-between gap-3">
                <span className="break-all font-mono text-sm">{name}</span>
                <Button
                  variant="link"
                  size="sm"
                  disabled={!enabled}
                  aria-label={`${t(`${p}detail.stopSubscription`)} ${name}`}
                  onClick={() => setConfirmation({ type: "cancel", queue: name })}
                >
                  {t(`${p}detail.stopSubscription`)}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t(`${p}detail.queuesUnknown`)}</p>
        )}
        <form
          className="flex min-w-0 flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const name = queue.trim()
            if (name && !queues.includes(name)) void run({ type: "add", queue: name })
          }}
        >
          <Input
            aria-label={t(`${p}control.queueName`)}
            placeholder={t(`${p}control.queuePlaceholder`)}
            className="min-w-0 flex-1 basis-40"
            value={queue}
            disabled={!enabled}
            onChange={(event) => setQueue(event.target.value)}
          />
          <Button type="submit" disabled={!enabled || !queue.trim() || queues.includes(queue.trim())}>
            {t(`${p}detail.subscribe`)}
          </Button>
        </form>
      </QueueSection>
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(`${p}${confirmation?.type === "shrink" ? "control.poolShrink" : "detail.stopSubscription"}`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation &&
                ("n" in confirmation
                  ? t(`${p}detail.shrinkConfirm`, { count: confirmation.n })
                  : "queue" in confirmation
                    ? t(`${p}detail.cancelConfirm`, { queue: confirmation.queue })
                    : "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!enabled}
              onClick={() => {
                if (!confirmation) return
                const command = confirmation
                setConfirmation(null)
                void run(command)
              }}
            >
              {t("common.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
