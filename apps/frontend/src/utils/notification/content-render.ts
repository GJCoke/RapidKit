import { $t, getLocale } from "@/locales"

import { renderLocalizedContent } from "./localized-content"

type RenderableMessage = Pick<Api.Notification.Message, "title" | "content" | "contentParams"> & { contentMode: string }

function render(text: string, mode: string, params?: Record<string, unknown> | null): string {
  if (mode !== "i18n") return text

  return $t(text as I18nFullKey, params ?? {})
}

export function renderTitle(message: RenderableMessage): string {
  if (message.contentMode === "local")
    return renderLocalizedContent(message.contentParams, getLocale())?.title ?? message.title
  return render(message.title, message.contentMode, message.contentParams)
}

export function renderContent(message: RenderableMessage): string {
  if (message.contentMode === "local")
    return renderLocalizedContent(message.contentParams, getLocale())?.content ?? message.content
  return render(message.content, message.contentMode, message.contentParams)
}
