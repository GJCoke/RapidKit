import { useRef } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "@rapidkit/ui"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"
import { getAuthSession } from "@/services/auth-session"
import type { NotificationMessage } from "@/services/api/notification"
import { notificationKeys, useNotificationActions } from "@/services/hooks/use-notifications"
import { isNotificationActionable, resolveNotificationAction } from "./notification-model"

export function useNotificationOperations() {
  const mutation = useNotificationActions(),
    navigate = useNavigate(),
    client = useQueryClient()
  const { t } = useTranslation()
  const lock = useRef(false)
  const perform = async (action: Parameters<typeof mutation.mutateAsync>[0]) => {
    if (lock.current || !useAuthStore.getState().token) return false
    const session = getAuthSession()
    lock.current = true
    try {
      const result = await mutation.mutateAsync(action)
      return !result.ignored && result.session === session && session === getAuthSession()
    } catch {
      if (session === getAuthSession()) toast.error(t("notification.operationFailed"))
      return false
    } finally {
      lock.current = false
    }
  }
  const read = async (message: NotificationMessage, followAction: boolean) => {
    if (message.status === "recalled") return false
    const session = getAuthSession()
    if (!(await perform({ type: "read", id: message.id })) || session !== getAuthSession()) return false
    const recalls = client.getQueryData<ReadonlySet<string>>(notificationKeys.recalls(session))
    if (!followAction || recalls?.has(message.messageId) || !isNotificationActionable(message)) return false
    const destination = resolveNotificationAction(message.action, useRouteStore.getState().snapshot)
    if (!destination) {
      toast.warning(t("notification.actionUnavailable"))
      return false
    }
    if (destination.external) window.open(destination.href, "_blank", "noopener,noreferrer")
    else await navigate(destination.href)
    return true
  }
  return { mutation, perform, read }
}
