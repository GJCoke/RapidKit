// @vitest-environment jsdom

import { expect, test } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { themeCapabilities, themeWorkbenchControls } from "@/features/theme/theme-capabilities"
import { ColorsNavigationPanel } from "@/features/theme/components/colors-navigation-panel"
import { DesignSystemPanel } from "@/features/theme/components/design-system-panel"
import { ExperiencePanel } from "@/features/theme/components/experience-panel"
import { LayoutPanel } from "@/features/theme/components/layout-panel"
import { findUnwrappedThemeWorkbenchControls } from "@/features/theme/components/theme-fields"

test("rendered workbench controls exactly match the runtime and export-only registry", () => {
  const { container } = renderAdmin(
    <>
      <ColorsNavigationPanel />
      <DesignSystemPanel />
      <LayoutPanel />
      <ExperiencePanel />
    </>,
  )

  const renderedFields = Array.from(container.querySelectorAll<HTMLElement>("[data-theme-workbench-field]")).map(
    (node) => node.dataset.themeWorkbenchField,
  )
  const registeredFields = themeWorkbenchControls.map(({ field }) => field)

  expect(renderedFields.toSorted()).toEqual(registeredFields.toSorted())
  expect(findUnwrappedThemeWorkbenchControls(container)).toEqual([])
  expect(new Set(themeWorkbenchControls.filter(({ kind }) => kind === "runtime").map(({ field }) => field))).toEqual(
    new Set(themeCapabilities.map(({ field }) => field)),
  )
  expect(
    themeWorkbenchControls
      .filter((control) => control.kind === "export-only")
      .every((control) => !("runtimeOwner" in control)),
  ).toBe(true)
})

test("the workbench detector reports interactive controls that bypass the registry wrapper", () => {
  const { container } = renderAdmin(<button type="button">Unregistered control</button>)

  expect(findUnwrappedThemeWorkbenchControls(container)).toHaveLength(1)
})
