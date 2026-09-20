// @vitest-environment jsdom

import assert from "node:assert/strict"
import { test } from "vitest"

import { useLocaleStore } from "@/stores/locale"
import { getRequestLocale } from "@/services/request"

test("request language follows the locale store synchronously", () => {
  useLocaleStore.getState().setLocale("en-US")
  assert.equal(getRequestLocale(), "en-US")

  useLocaleStore.getState().setLocale("zh-CN")
  assert.equal(getRequestLocale(), "zh-CN")
})
