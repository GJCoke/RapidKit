// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"

import i18n from "@/locales"
import { useLocaleStore } from "@/stores/locale"
import { renderAdmin } from "@test/setup/render"

import { LocaleSwitch } from "@/features/locale/locale-switch"

afterEach(async () => {
  useLocaleStore.setState({ locale: "zh-CN" })
  await i18n.changeLanguage("zh-CN")
})

describe.each([
  { locale: "zh-CN" as const, label: "切换语言" },
  { locale: "en-US" as const, label: "Switch language" },
])("$locale locale", ({ locale, label }) => {
  test("gives the desktop locale trigger a translated accessible name", async () => {
    useLocaleStore.setState({ locale })
    await i18n.changeLanguage(locale)

    renderAdmin(<LocaleSwitch />)

    expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
  })
})
