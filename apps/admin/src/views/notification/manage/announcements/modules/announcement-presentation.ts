import type { Announcement } from "@/services/api/announcement"
import type { AnnouncementRowAction } from "./announcement-model"
export function announcementStatusText(
  row: Pick<Announcement, "displayMode" | "status">,
  translate: (key: string) => string,
) {
  const labels: Partial<Record<Announcement["status"], string>> = {
    published: "active",
    scheduled: "pending",
    recalled: "takenDown",
  }
  const label = row.displayMode === "top_banner" ? labels[row.status] : undefined
  return translate(label ? `announcement.table.${label}` : `announcement.statusOptions.${row.status}`)
}
export function announcementActionText(
  row: { displayMode?: string; status: string },
  action: AnnouncementRowAction,
  translate: (key: string) => string,
) {
  const key =
    action === "cancel"
      ? row.status === "draft"
        ? "cancelDraft"
        : "cancelPlan"
      : action === "delete"
        ? row.status === "draft"
          ? "deleteDraft"
          : "deletePlan"
        : action === "recall" && row.displayMode === "top_banner"
          ? "takeDown"
          : action
  return translate(`announcement.table.${key}`)
}
export function announcementCategoryText(category: string, translate: (key: string, fallback: string) => string) {
  const key = category.replace(/\.([a-z])/g, (_match, letter: string) => letter.toUpperCase())
  return translate(`notification.category.${key}`, category)
}
