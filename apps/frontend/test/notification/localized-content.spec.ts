import { describe, expect, it } from "vitest"
import { renderLocalizedContent } from "@/utils/notification/localized-content"
import {
  buildLocalizedContent,
  createLocalizedEditor,
  restoreLocalizedEditor,
  syncLocalizedParameters,
} from "@/views/notification/manage/announcements/modules/localized-editor"

const content = {
  defaultLocale: "zh-CN",
  translations: {
    "zh-CN": { title: "维护 {system}", content: "{count} / {active}" },
    "en-US": { title: "Maintenance {system}", content: "{count} / {active}" },
  },
  parameters: { system: "RapidKit", count: 0, active: false },
} as const

describe("localized announcement content", () => {
  it("chooses the interface locale, preserves zero/false, and falls back for unknown languages", () => {
    expect(renderLocalizedContent(content, "en-US")).toMatchObject({
      title: "Maintenance RapidKit",
      content: "0 / false",
      locale: "en-US",
      fallback: false,
    })
    expect(renderLocalizedContent(content, "fr-FR")).toMatchObject({
      title: "维护 RapidKit",
      locale: "zh-CN",
      fallback: true,
    })
  })
  it("falls back as a complete title/body pair for empty or partial optional translation", () => {
    const partial = { ...content, translations: { ...content.translations, "en-US": { title: "", content: "Body" } } }
    expect(renderLocalizedContent(partial, "en-US")).toMatchObject({
      title: "维护 RapidKit",
      content: "0 / false",
      locale: "zh-CN",
      fallback: true,
    })
  })
  it("substitutes literal values without interpreting braces, HTML or dollar replacement patterns", () => {
    const literal = { ...content, parameters: { system: "$&{active}", count: 0, active: false } }
    expect(renderLocalizedContent(literal, "en-US")?.title).toBe("Maintenance $&{active}")
    expect(renderLocalizedContent({ ...content, parameters: {} }, "zh-CN")?.missing).toEqual([
      "system",
      "count",
      "active",
    ])
    expect(renderLocalizedContent({ translations: null }, "zh-CN")).toBeNull()
  })
  it("restores typed parameters and every language through the API envelope", () => {
    const editor = restoreLocalizedEditor(content)
    expect(editor.parameters.count).toEqual({ type: "number", value: "0" })
    expect(editor.parameters.active).toEqual({ type: "boolean", value: "false" })
    expect(buildLocalizedContent(editor)).toEqual(content)
  })
  it("identifies a union of parameters and retains values when content is removed and restored", () => {
    const editor = createLocalizedEditor()
    editor.translations["zh-CN"] = { title: "Hello {name}", content: "你好 {name}" }
    editor.translations["en-US"] = { title: "Hello", content: "{count}" }
    expect(syncLocalizedParameters(editor)).toEqual(["name", "count"])
    editor.parameters.name!.value = "Alice"
    editor.translations["zh-CN"].title = "Hello"
    editor.translations["zh-CN"].content = "你好"
    expect(syncLocalizedParameters(editor)).toEqual(["count"])
    editor.translations["zh-CN"].title = "Hello {name}"
    syncLocalizedParameters(editor)
    expect(editor.parameters.name!.value).toBe("Alice")
  })
  it("rejects incomplete default/optional languages and groups missing parameter names", () => {
    const editor = createLocalizedEditor()
    expect(() => buildLocalizedContent(editor)).toThrow("localizedDefaultRequired")
    editor.translations["zh-CN"] = { title: "标题", content: "正文" }
    editor.translations["en-US"].title = "Title"
    expect(() => buildLocalizedContent(editor)).toThrow("localizedPartial")
    editor.translations["en-US"].title = ""
    editor.translations["zh-CN"].content = "{first} {second}"
    syncLocalizedParameters(editor)
    try {
      buildLocalizedContent(editor)
    } catch (error) {
      expect(error).toMatchObject({ key: "localizedValuesRequired", params: { names: "first、second" } })
    }
  })
  it("omits blank optional translations and stale parameters, rejects invalid numeric values", () => {
    const editor = createLocalizedEditor()
    editor.translations["zh-CN"] = { title: "Title", content: "{n}" }
    syncLocalizedParameters(editor)
    editor.parameters.n = { type: "number", value: "Infinity" }
    expect(() => buildLocalizedContent(editor)).toThrow("localizedValuesInvalid")
    editor.parameters.n.value = "0"
    editor.parameters.stale = { type: "string", value: "unused" }
    expect(buildLocalizedContent(editor)).toEqual({
      defaultLocale: "zh-CN",
      translations: { "zh-CN": { title: "Title", content: "{n}" } },
      parameters: { n: 0 },
    })
  })
})
