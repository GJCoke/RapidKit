import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui/components/button"
import { Textarea } from "@rapidkit/ui/components/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rapidkit/ui/components/dialog"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import type { User } from "@/services/api/user"
import { impersonationSession, useImpersonationStore } from "@/features/auth/impersonation-runtime"
import { hasImpersonationStorage } from "@/features/auth/impersonation-storage"
import { canImpersonateUser } from "./user-eligibility"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null | undefined
  departmentName?: string
}
export function ImpersonationDialog(props: Props) {
  const actor = useAuthStore((s) => s.userInfo)
  const snapshot = useImpersonationStore((s) => s.snapshot)
  if (
    !props.open ||
    !props.user ||
    !canImpersonateUser(actor, props.user, Boolean(snapshot) || hasImpersonationStorage())
  )
    return null
  return <Confirmation key={`${getAuthSession()}:${props.user.id}`} {...props} user={props.user} />
}
function Confirmation({ onOpenChange, user, departmentName }: Props & { user: User }) {
  const { t } = useTranslation()
  const reasonId = useId()
  const session = useRef(getAuthSession()).current
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false),
    mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const current = () =>
    mounted.current &&
    session === getAuthSession() &&
    canImpersonateUser(useAuthStore.getState().userInfo, user, hasImpersonationStorage())
  const submit = async () => {
    if (busy.current || !current()) return
    busy.current = true
    setPending(true)
    setFailed(false)
    try {
      const started = await impersonationSession.enter(
        { targetUserId: user.id, reason: reason.trim() || null },
        window.location.pathname + window.location.search + window.location.hash,
      )
      if (!current()) return
      if (started) onOpenChange(false)
      else setFailed(true)
    } catch {
      if (current()) setFailed(true)
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy.current) onOpenChange(open)
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("users.impersonation.confirmTitle")}</DialogTitle>
          <DialogDescription>{t("users.impersonation.warning")}</DialogDescription>
        </DialogHeader>
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt>{t("users.fields.name")}</dt>
          <dd className="break-all">
            {user.name} ({user.username})
          </dd>
          <dt>{t("users.fields.roles")}</dt>
          <dd className="break-all">{user.roles.join(", ") || "—"}</dd>
          <dt>{t("users.fields.department")}</dt>
          <dd className="break-all">{departmentName || "—"}</dd>
        </dl>
        <div className="space-y-2">
          <label htmlFor={reasonId}>{t("users.impersonation.reason")}</label>
          <Textarea
            id={reasonId}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
          />
          <p className="text-right text-xs text-muted-foreground">{reason.length}/500</p>
        </div>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("users.impersonation.failed")}
          </p>
        )}
        <DialogFooter className="m-0 bg-transparent p-0">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {t("users.impersonation.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
