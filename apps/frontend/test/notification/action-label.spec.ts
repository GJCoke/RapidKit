import { describe, expect, it } from "vitest"
import { resolveActionLabel } from "@/utils/notification/action-label"

const localized = { defaultLocale: "zh-CN", translations: { "zh-CN": "查看详情", "en-US": "View details" } }

describe("notification action label resolution", () => {
  it.each(["localizedLabel", "localized_label"])("resolves current language for %s envelopes", (key) => {
    expect(resolveActionLabel({ label: "旧名称", [key]: localized }, "en-US")).toEqual({
      text: "View details",
      locale: "en-US",
      fallback: false,
    })
    expect(resolveActionLabel({ [key]: localized }, "fr-FR")).toEqual({
      text: "查看详情",
      locale: "zh-CN",
      fallback: true,
    })
  })
  it("falls back for missing translations and handles persisted snake-case default locales", () => {
    expect(
      resolveActionLabel(
        { localized_label: { default_locale: "en-US", translations: { "en-US": "Open", "zh-CN": " " } } },
        "zh-CN",
      ),
    ).toEqual({ text: "Open", locale: "en-US", fallback: true })
  })
  it("retains legacy labels and returns empty text for absent or malformed envelopes", () => {
    expect(resolveActionLabel({ label: " Open " }, "en-US").text).toBe("Open")
    expect(resolveActionLabel(null, "en-US").text).toBe("")
    expect(
      resolveActionLabel({ localizedLabel: { defaultLocale: "zh-CN", translations: null }, label: "旧名称" }, "en-US")
        .text,
    ).toBe("旧名称")
  })
})
