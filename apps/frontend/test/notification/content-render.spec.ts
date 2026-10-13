import { describe, expect, it, vi } from "vitest"

const locale = vi.hoisted(() => ({ current: "zh-CN" }))
vi.mock("@/locales", () => ({
  getLocale: () => locale.current,
  $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}::${JSON.stringify(params)}` : key),
}))

import { renderContent, renderTitle } from "@/utils/notification/content-render"

describe("content-render", () => {
  it("returns literal title and content for raw messages", () => {
    const message = { contentMode: "raw", title: "Hi", content: "Body", contentParams: null } as any

    expect(renderTitle(message)).toBe("Hi")
    expect(renderContent(message)).toBe("Body")
  })

  it("translates i18n content with its named parameters", () => {
    const message = {
      contentMode: "i18n",
      title: "notification.x.title",
      content: "notification.x.body",
      contentParams: { name: "alice" },
    } as any

    expect(renderTitle(message)).toBe('notification.x.title::{"name":"alice"}')
    expect(renderContent(message)).toBe('notification.x.body::{"name":"alice"}')
  })
})

it("renders local messages again when the interface language changes, and falls back for missing languages", () => {
  const message = {
    contentMode: "local",
    title: "snapshot",
    content: "snapshot",
    contentParams: {
      defaultLocale: "zh-CN",
      translations: {
        "zh-CN": { title: "你好 {name}", content: "中文正文" },
        "en-US": { title: "Hello {name}", content: "English body" },
      },
      parameters: { name: "Alice" },
    },
  } as any
  locale.current = "en-US"
  expect(renderTitle(message)).toBe("Hello Alice")
  expect(renderContent(message)).toBe("English body")
  locale.current = "zh-CN"
  expect(renderTitle(message)).toBe("你好 Alice")
  locale.current = "fr-FR"
  expect(renderContent(message)).toBe("中文正文")
  locale.current = "zh-CN"
})
