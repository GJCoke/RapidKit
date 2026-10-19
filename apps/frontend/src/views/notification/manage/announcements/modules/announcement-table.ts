import { $t } from "@/locales"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import { resolveRow } from "@/hooks/business/table-actions/resolve"
import type { ActionDefinition, ActionModel, ActionEntry } from "@/hooks/business/table-actions/types"

type Announcement = Api.Notification.AnnouncementItem
export type AnnouncementAction = "detail" | "edit" | "copy" | "publish" | "cancel" | "delete" | "recall"

export const announcementPermissions = {
  create: "notification:create",
  update: "notification:update",
  delete: "notification:delete",
  publish: "notification:publish",
  cancel: "notification:cancel",
  recall: "notification:recall",
} satisfies Record<string, PermissionCode>

export const announcementTableText = (key: string) =>
  $t(`page.notification.manage.announcements.table.${key}` as I18nFullKey)

export function createAnnouncementActionModel(): ActionModel<Announcement> {
  const actions: ActionDefinition<Announcement>[] = [
    { key: "detail", access: { kind: "page" }, width: () => textButtonWidth(announcementTableText("detail")) },
    ...(["edit", "copy", "publish", "cancel", "delete", "recall"] as const).map(
      (key): ActionDefinition<Announcement> => ({
        key,
        access: {
          kind: "all",
          codes:
            key === "publish"
              ? [announcementPermissions.publish, announcementPermissions.update]
              : [
                  key === "copy"
                    ? announcementPermissions.create
                    : announcementPermissions[key === "edit" ? "update" : key],
                ],
        },
        width: () => textButtonWidth(announcementTableText(key)),
      }),
    ),
  ]
  const entries = (keys: string[]): ActionEntry[] => [
    { kind: "action", key: "detail" },
    { kind: "menu", key: "more", actions: keys, width: () => textButtonWidth(announcementTableText("more"), 18) },
  ]
  return {
    actions,
    layouts: [
      {
        key: "draft",
        matches: (row) => row.status === "draft",
        entries: entries(["edit", "copy", "publish", "cancel", "delete"]),
      },
      {
        key: "scheduled",
        matches: (row) => row.status === "scheduled",
        entries: entries(["edit", "copy", "cancel", "delete"]),
      },
      { key: "published", matches: (row) => row.status === "published", entries: entries(["copy", "recall"]) },
      { key: "other", matches: () => true, entries: entries(["copy"]) },
    ],
  }
}

export function announcementActions(row: Announcement, hasAuth: (permission: PermissionCode) => boolean) {
  const entries = resolveRow(
    createAnnouncementActionModel(),
    {
      ready: true,
      hasAuth,
      actorId: "",
      isAdmin: false,
      impersonating: false,
      locale: "",
    },
    row,
  )
  return {
    primary: "detail" as const,
    more: (entries.find((entry) => entry.kind === "menu")?.actions ?? []) as AnnouncementAction[],
  }
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
