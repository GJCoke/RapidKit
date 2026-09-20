// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import { expect, test } from "vitest"
import i18n from "@/locales"
import { renderAdmin } from "@test/setup/render"
import { ColorsNavigationPanel } from "@/features/theme/components/colors-navigation-panel"
import { DesignSystemPanel } from "@/features/theme/components/design-system-panel"

test("theme workbench localizes preset and system option labels", async () => {
  await i18n.changeLanguage("zh-CN")
  renderAdmin(
    <>
      <ColorsNavigationPanel />
      <DesignSystemPanel />
    </>,
  )

  expect(screen.getByRole("button", { name: "云靛蓝" })).toBeInTheDocument()
  expect(screen.getByRole("combobox", { name: "基础颜色" })).toHaveTextContent("中性")
})
