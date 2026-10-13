import { $t } from "@/locales"

type Announcement = Api.Notification.AnnouncementItem
export type AnnouncementAction = "detail" | "edit" | "copy" | "publish" | "cancel" | "delete" | "recall"

export const announcementPermissions = {
  create: "POST:/api/v1/admin/notifications",
  update: "PUT:/api/v1/admin/notifications/{message_id}",
  delete: "DELETE:/api/v1/admin/notifications/{message_id}",
  publish: "POST:/api/v1/admin/notifications/{message_id}/publish",
  cancel: "POST:/api/v1/admin/notifications/{message_id}/cancel",
  recall: "POST:/api/v1/admin/notifications/{message_id}/recall",
}

export const announcementTableText = (key: string) =>
  $t(`page.notification.manage.announcements.table.${key}` as I18nFullKey)

export function announcementActions(row: Announcement, hasAuth: (permission: string) => boolean) {
  const editable = ["draft", "scheduled"].includes(row.status)
  const canCopy = hasAuth(announcementPermissions.create)
  const primary: AnnouncementAction = "detail"
  const more: AnnouncementAction[] = []
  if (editable && hasAuth(announcementPermissions.update)) more.push("edit")
  if (canCopy) more.push("copy")
  if (row.status === "draft" && hasAuth(announcementPermissions.publish) && hasAuth(announcementPermissions.update))
    more.push("publish")
  if (editable && hasAuth(announcementPermissions.cancel)) more.push("cancel")
  if (editable && hasAuth(announcementPermissions.delete)) more.push("delete")
  if (row.status === "published" && hasAuth(announcementPermissions.recall)) more.push("recall")
  return { primary, more }
}

export function announcementActionLabel(row: Announcement, action: AnnouncementAction) {
  if (action === "cancel") return announcementTableText(row.status === "draft" ? "cancelDraft" : "cancelPlan")
  if (action === "delete") return announcementTableText(row.status === "draft" ? "deleteDraft" : "deletePlan")
  if (action === "recall") return announcementTableText(row.displayMode === "top_banner" ? "takeDown" : "recall")
  return announcementTableText(action)
}

export function announcementStatus(row: Announcement) {
  const banner = row.displayMode === "top_banner"
  const labels: Record<string, string> = { published: "active", scheduled: "pending", recalled: "takenDown" }
  const type =
    row.status === "published"
      ? "success"
      : ["scheduled", "publishing"].includes(row.status)
        ? "info"
        : row.status === "recalled"
          ? "warning"
          : "default"
  return {
    label:
      banner && labels[row.status]
        ? announcementTableText(labels[row.status]!)
        : $t(`page.notification.manage.announcements.statusOptions.${row.status}` as I18nFullKey),
    type,
  } as const
}

export function announcementCategory(category: string) {
  const names: Record<string, string> = {
    "admin.announcement": "adminAnnouncement",
    "system.security": "systemSecurity",
    "user.invited": "userInvited",
    "user.mention": "userMention",
    "task.completed": "taskCompleted",
  }
  return names[category] ? $t(`notification.category.${names[category]}` as I18nFullKey) : category
}
