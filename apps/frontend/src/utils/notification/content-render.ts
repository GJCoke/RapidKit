import { $t } from "@/locales"

type RenderableMessage = Pick<Api.Notification.Message, "contentMode" | "title" | "content" | "contentParams">

function render(text: string, mode: Api.Notification.ContentMode, params?: Record<string, unknown> | null): string {
  if (mode === "raw") return text

  return $t(text as I18nFullKey, params ?? {})
}

export function renderTitle(message: RenderableMessage): string {
  return render(message.title, message.contentMode, message.contentParams)
}

export function renderContent(message: RenderableMessage): string {
  return render(message.content, message.contentMode, message.contentParams)
}
