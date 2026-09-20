import { describe, expect, it, vi } from "vitest"

vi.mock("@/locales", () => ({
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
