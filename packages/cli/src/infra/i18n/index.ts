import zhCN from "./zh-CN"
import enUS from "./en-US"
import type { RapidKitConfig } from "../config"

export type MessageKey = keyof typeof zhCN

const locales: Record<NonNullable<RapidKitConfig["locale"]>, Record<string, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
}

let currentMessages: Record<string, string> = zhCN

export function setLocale(locale: NonNullable<RapidKitConfig["locale"]>): void {
  currentMessages = locales[locale]
}

export function t(key: MessageKey, params?: Record<string, string>): string {
  let message = currentMessages[key] ?? key

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      message = message.replaceAll(`{${k}}`, v)
    }
  }

  return message
}
