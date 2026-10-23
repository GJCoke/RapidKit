import { expect, test } from "vitest"
import { emptyAnnouncementForm } from "@/views/notification/manage/announcements/modules/announcement-model"
import { announcementPreview } from "@/views/notification/manage/announcements/modules/announcement-preview"
test("localized preview uses complete-language fallback while keeping validation issues visible", () => {
  const form = emptyAnnouncementForm()
  form.contentSource = "local"
  form.localized.translations["zh-CN"] = { title: "通知 {count}", content: "正文" }
  form.localized.translations["en-US"] = { title: "Partial", content: "" }
  form.localized.parameters.count = { type: "number", value: "3" }
  const result = announcementPreview(form, { locale: "en-US", translate: (key) => key })
  expect(result).toMatchObject({ title: "通知 3", content: "正文" })
  expect(result.issues.map((issue) => issue.key)).toEqual(["localizedPartial", "localizedFallback"])
})
test("legacy translation preview reports missing translations and malformed JSON instead of crashing", () => {
  const form = emptyAnnouncementForm()
  form.contentSource = "i18n"
  form.i18nKey = "notification.notice"
  form.i18nParams = "{}"
  expect(announcementPreview(form, { locale: "en-US", translate: (key) => key }).issues).toEqual([
    { key: "translationMissing" },
  ])
  form.i18nParams = "[]"
  expect(announcementPreview(form, { locale: "en-US", translate: (key) => key }).issues).toEqual([
    { key: "i18nParamsInvalid" },
  ])
})
