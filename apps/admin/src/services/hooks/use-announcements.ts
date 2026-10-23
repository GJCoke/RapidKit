import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"
import { getAuthSession } from "@/services/auth-session"
import { usePaginatedTable } from "@/shared/data-table"
import type { PermissionCode } from "@/typings/permission-codes"
import {
  fetchAnnouncements,
  fetchAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  publishAnnouncement,
  cancelAnnouncement,
  recallAnnouncement,
  checkAnnouncementBanner,
  fetchAnnouncementActionTargets,
  type AnnouncementQuery,
  type AnnouncementList,
  type AnnouncementBody,
  type AnnouncementUpdateBody,
  type AnnouncementBannerConfirmation,
} from "@/services/api/announcement"
import { fetchNotificationTemplates } from "@/services/api/notification-template"
import { fetchAllRoles } from "@/services/api/role"
import { fetchAllUsers } from "@/services/api/user"
import { fetchDepartmentTree } from "@/services/api/department"
import { notificationKeys } from "./use-notifications"

export const announcementKeys = {
  all: (session: number) => ["announcements", session] as const,
  options: (session: number) => ["announcement-options", session] as const,
  templates: (session: number) => ["notification-templates", session] as const,
}
export function requireAnnouncementPermission(code: PermissionCode, session: number) {
  if (session !== getAuthSession()) throw new Error("Announcement editor session changed")
  const state = useAuthStore.getState()
  if (!state.token || !hasPermission(state.userInfo, code)) throw new Error("Announcement operation permission revoked")
}
export async function announcementData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Announcement response is empty")
  return result.data
}
function useScope() {
  const token = useAuthStore((state) => state.token),
    locale = useLocaleStore((state) => state.locale)
  return { session: getAuthSession(), locale, token }
}
export function useAnnouncements(params: Omit<AnnouncementQuery, "page" | "pageSize">) {
  const { session, locale } = useScope(),
    canRead = usePermission("notification:read")
  const client = useQueryClient()
  const table = usePaginatedTable({
    queryKey: [...announcementKeys.all(session), "list", locale, params],
    queryFn: ({ page, pageSize }) => {
      requireAnnouncementPermission("notification:read", session)
      return announcementData(fetchAnnouncements({ ...params, page, pageSize }))
    },
  })
  return {
    ...table,
    getRow: (id: string) =>
      client
        .getQueryData<AnnouncementList>([
          ...announcementKeys.all(session),
          "list",
          locale,
          params,
          { page: table.page, pageSize: table.pageSize },
        ])
        ?.records.find((row) => row.id === id),
    tableData: {
      ...table.tableData,
      records: !canRead || table.query.isPlaceholderData ? [] : table.tableData.records,
    },
  }
}
export function useAnnouncementDetail(id: string | null, enabled = true) {
  const { session, locale } = useScope(),
    canRead = usePermission("notification:read")
  return useQuery({
    queryKey: [...announcementKeys.all(session), "detail", locale, id],
    queryFn: () => {
      requireAnnouncementPermission("notification:read", session)
      if (!id) throw new Error("Announcement ID required")
      return announcementData(fetchAnnouncement(id))
    },
    enabled: Boolean(id) && enabled && canRead,
    retry: false,
    staleTime: 0,
  })
}
export function useAnnouncementBannerSummary() {
  const { session, locale } = useScope(),
    canPreview = usePermission("notification:preview")
  const revision = useQuery({
    queryKey: [...notificationKeys.session(session), "banner-revision"],
    queryFn: () => 0,
    initialData: 0,
    enabled: false,
  })
  return useQuery({
    queryKey: [...announcementKeys.all(session), "banners", locale, revision.data],
    queryFn: () => {
      requireAnnouncementPermission("notification:preview", session)
      return announcementData(checkAnnouncementBanner())
    },
    enabled: canPreview,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}
export function useAnnouncementTemplates(keyword: string, enabled: boolean) {
  const { session, locale } = useScope(),
    canRead = usePermission("notification-template:read")
  return useQuery({
    queryKey: [...announcementKeys.templates(session), locale, { keyword, enabled: true }],
    queryFn: () => {
      requireAnnouncementPermission("notification-template:read", session)
      return announcementData(
        fetchNotificationTemplates({ page: 1, pageSize: 100, enabled: true, keyword: keyword || undefined }),
      )
    },
    enabled: enabled && canRead,
    retry: false,
    staleTime: 0,
  })
}
export function useAnnouncementActionTargets(enabled: boolean) {
  const { session, locale } = useScope(),
    canPreview = usePermission("notification:preview")
  return useQuery({
    queryKey: [...announcementKeys.options(session), "action-targets", locale],
    queryFn: () => {
      requireAnnouncementPermission("notification:preview", session)
      return announcementData(fetchAnnouncementActionTargets())
    },
    enabled: enabled && canPreview,
    retry: false,
    staleTime: 0,
  })
}
export function useAnnouncementDirectories(types: readonly ("role" | "user" | "department")[]) {
  const { session, locale } = useScope()
  const canRoles = usePermission("role:options"),
    canUsers = usePermission("user:options"),
    canDepartments = usePermission("department:read")
  const roles = useQuery({
    queryKey: [...announcementKeys.options(session), "roles", locale],
    queryFn: () => {
      requireAnnouncementPermission("role:options", session)
      return announcementData(fetchAllRoles())
    },
    enabled: types.includes("role") && canRoles,
    retry: false,
    staleTime: 0,
  })
  const users = useQuery({
    queryKey: [...announcementKeys.options(session), "users", locale],
    queryFn: () => {
      requireAnnouncementPermission("user:options", session)
      return announcementData(fetchAllUsers())
    },
    enabled: types.includes("user") && canUsers,
    retry: false,
    staleTime: 0,
  })
  const departments = useQuery({
    queryKey: [...announcementKeys.options(session), "departments", locale],
    queryFn: () => {
      requireAnnouncementPermission("department:read", session)
      return announcementData(fetchDepartmentTree())
    },
    enabled: types.includes("department") && canDepartments,
    retry: false,
    staleTime: 0,
  })
  return { roles, users, departments, canRoles, canUsers, canDepartments }
}
export function useAnnouncementWrites() {
  const client = useQueryClient(),
    session = getAuthSession()
  const invalidate = async () => {
    if (session !== getAuthSession()) return
    const roots = [announcementKeys.all(session), notificationKeys.root(session)]
    await Promise.all(roots.map((queryKey) => client.cancelQueries({ queryKey })))
    if (session !== getAuthSession()) return
    await Promise.all(roots.map((queryKey) => client.invalidateQueries({ queryKey })))
  }
  const create = useMutation({
    mutationFn: (body: AnnouncementBody) => {
      requireAnnouncementPermission("notification:create", session)
      return announcementData(createAnnouncement(body))
    },
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AnnouncementUpdateBody }) => {
      requireAnnouncementPermission("notification:update", session)
      return announcementData(updateAnnouncement(id, body))
    },
    onSuccess: invalidate,
  })
  const publish = useMutation({
    mutationFn: ({ id, body }: { id: string; body?: AnnouncementBannerConfirmation }) => {
      requireAnnouncementPermission("notification:publish", session)
      return announcementData(publishAnnouncement(id, body))
    },
    onSuccess: invalidate,
  })
  const transition = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "delete" | "cancel" | "recall" }) => {
      requireAnnouncementPermission(`notification:${action}`, session)
      const result = await (action === "delete"
        ? deleteAnnouncement(id)
        : action === "cancel"
          ? cancelAnnouncement(id)
          : recallAnnouncement(id))
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: invalidate,
  })
  return { create, update, publish, transition }
}
