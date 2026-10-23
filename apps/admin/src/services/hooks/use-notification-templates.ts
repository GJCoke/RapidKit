import { useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"
import { getAuthSession } from "@/services/auth-session"
import type { PermissionCode } from "@/typings/permission-codes"
import { usePaginatedTable } from "@/shared/data-table"
import {
  fetchNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  type NotificationTemplateQuery,
  type NotificationTemplateList,
  type CreateNotificationTemplateBody,
  type UpdateNotificationTemplateBody,
} from "@/services/api/notification-template"
export const notificationTemplateKeys = { all: (session: number) => ["notification-templates", session] as const }
export function requireTemplatePermission(code: PermissionCode, session: number) {
  if (session !== getAuthSession()) throw new Error("Template editor session changed")
  const state = useAuthStore.getState()
  if (!state.token || !hasPermission(state.userInfo, code)) throw new Error("Template operation permission revoked")
}
async function templateData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Template response is empty")
  return result.data
}
export function useNotificationTemplates(params: Omit<NotificationTemplateQuery, "page" | "pageSize">) {
  useAuthStore((state) => state.token)
  const locale = useLocaleStore((state) => state.locale),
    session = getAuthSession(),
    canRead = usePermission("notification-template:read"),
    client = useQueryClient()
  const queryKey = [...notificationTemplateKeys.all(session), "list", locale, params]
  const table = usePaginatedTable({
    initialPageSize: 20,
    staleTime: 0,
    queryKey,
    queryFn: ({ page, pageSize }) => {
      requireTemplatePermission("notification-template:read", session)
      return templateData(fetchNotificationTemplates({ ...params, page, pageSize }))
    },
  })
  return {
    ...table,
    tableData: {
      ...table.tableData,
      records: canRead && !table.query.isPlaceholderData ? table.tableData.records : [],
    },
    getRow: (id: string) =>
      client
        .getQueryData<NotificationTemplateList>([...queryKey, { page: table.page, pageSize: table.pageSize }])
        ?.records.find((row) => row.id === id),
  }
}
export function useNotificationTemplateWrites() {
  const session = useRef(getAuthSession()).current,
    client = useQueryClient()
  const invalidate = async () => {
    if (session !== getAuthSession()) return
    const queryKey = notificationTemplateKeys.all(session)
    await client.cancelQueries({ queryKey })
    if (session === getAuthSession()) await client.invalidateQueries({ queryKey })
  }
  const create = useMutation({
    mutationFn: (body: CreateNotificationTemplateBody) => {
      requireTemplatePermission("notification-template:create", session)
      return templateData(createNotificationTemplate(body))
    },
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateNotificationTemplateBody }) => {
      requireTemplatePermission("notification-template:update", session)
      return templateData(updateNotificationTemplate(id, body))
    },
    onSuccess: invalidate,
  })
  const deletion = useMutation({
    mutationFn: async (id: string) => {
      requireTemplatePermission("notification-template:delete", session)
      const result = await deleteNotificationTemplate(id)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: invalidate,
  })
  return { create, update, deletion }
}
