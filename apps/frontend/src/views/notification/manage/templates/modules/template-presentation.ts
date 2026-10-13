import { $t } from "@/locales"

export function templateListText(key: string, params: Record<string, unknown> = {}) {
  return $t(`page.notification.manage.templates.list.${key}` as I18nFullKey, params)
}

export function templateCategoryLabel(category: string) {
  const categories: Record<string, string> = {
    "admin.announcement": "adminAnnouncement",
    "system.security": "systemSecurity",
    "user.invited": "userInvited",
    "user.mention": "userMention",
    "task.completed": "taskCompleted",
  }
  const key = categories[category]
  return key ? $t(`notification.category.${key}` as I18nFullKey) : category
}

export function templateModeLabel(mode: Api.Notification.ContentMode) {
  return templateListText(mode === "raw" ? "rawMode" : "i18nMode")
}
