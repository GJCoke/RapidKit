// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import i18n from "@/locales"
import { useLocaleStore } from "@/stores/locale"
import { LocaleSync } from "@/features/locale/locale-sync"

afterEach(async () => {
  useLocaleStore.getState().setLocale("zh-CN")
  await i18n.changeLanguage("zh-CN")
})

test("synchronizes the selected locale with i18next and the document", async () => {
  render(<LocaleSync />)

  useLocaleStore.getState().setLocale("en-US")

  await waitFor(() => {
    expect(i18n.language).toBe("en-US")
    expect(document.documentElement.lang).toBe("en-US")
  })
})
