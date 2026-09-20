import assert from "node:assert/strict"
import { test } from "vitest"

import { APP_LOCALES, resolveLocale } from "@/features/locale/locale-model"

test("accepts supported locales and falls back deterministically", () => {
  assert.equal(resolveLocale("en-US"), "en-US")
  assert.equal(resolveLocale("zh-CN"), "zh-CN")
  assert.equal(resolveLocale("fr-FR"), "zh-CN")
  assert.equal(resolveLocale(undefined), "zh-CN")
})

test("exposes the supported locale options", () => {
  assert.deepEqual(APP_LOCALES, [
    { key: "zh-CN", label: "中文" },
    { key: "en-US", label: "English" },
  ])
})
