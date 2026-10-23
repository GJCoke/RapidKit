import { expect, test } from "vitest"
import i18next from "i18next"
import { translateText } from "@/shared/i18n-text"
test("translation variables interpolate without changing runtime options, language or fallback", async () => {
  const i18n = i18next.createInstance()
  await i18n.init({
    lng: "en-US",
    resources: {
      "en-US": {
        translation: {
          notice: { title: "Hello {{name}}", count_one: "{{count}} item", count_other: "{{count}} items" },
        },
      },
      "zh-CN": { translation: { notice: { title: "你好 {{name}}" } } },
    },
  })
  const t = i18n.t.bind(i18n),
    params = { name: "Ada", returnDetails: true, returnObjects: true, lng: "zh-CN", defaultValue: "Wrong", ns: "wrong" }
  expect(translateText(t, "notice.title", params)).toBe("Hello Ada")
  expect(translateText(t, "notice.missing", params)).toBe("notice.missing")
  expect(translateText(t, "notice", params)).toBe("notice")
  expect(translateText(t, "notice.count", { count: 0 })).toBe("0 items")
  expect(translateText(t, "notice.count", { count: 1 })).toBe("1 item")
})
