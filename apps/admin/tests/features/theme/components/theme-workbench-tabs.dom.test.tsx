// @vitest-environment jsdom

import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import i18n from "@/locales"
import { renderAdmin } from "@test/setup/render"
import { ThemeWorkbench, ThemeWorkbenchTrigger } from "@/features/theme/components/theme-workbench-trigger"
import { useAppStore } from "@/stores/app"

afterEach(() => {
  useAppStore.getState().setThemeWorkbenchOpen(false)
  useAppStore.getState().setThemeWorkbenchTab("design")
})

test("the workbench stays open on its active tab when a layout change remounts its header trigger", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  const view = renderAdmin(<ThemeWorkbenchTrigger />)

  await user.click(screen.getByRole("button", { name: i18n.t("theme.workbench.trigger") }))
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  await user.click(screen.getByRole("tab", { name: "Layout" }))
  expect(screen.getByRole("tab", { name: "Layout" })).toHaveAttribute("aria-selected", "true")

  view.rerender(<></>)
  view.rerender(<ThemeWorkbenchTrigger />)

  expect(screen.getByRole("dialog")).toBeInTheDocument()
  expect(screen.getByRole("tab", { name: "Layout" })).toHaveAttribute("aria-selected", "true")
})

test("each workbench tab exposes its controls inside the dedicated scroll region", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
  renderAdmin(<ThemeWorkbench open onOpenChange={vi.fn()} />)
  const tabsList = screen.getByRole("tablist")
  const scrollRegion = document.querySelector<HTMLElement>('[data-slot="theme-workbench-panel-scroll"]')!

  expect(screen.getByRole("dialog")).toHaveClass("data-[side=right]:sm:max-w-md")
  expect(document.querySelector('[data-slot="theme-workbench-tabs-scroll"]')).toBeNull()
  expect(tabsList).toHaveClass("grid", "w-full", "grid-cols-4")
  const tabs = screen.getAllByRole("tab")
  expect(tabs.map((tab) => tab.textContent)).toEqual(["Design", "Colors", "Layout", "Experience"])
  for (const tab of tabs) {
    expect(tab).toHaveClass("whitespace-nowrap")
    expect(tab).not.toHaveClass("flex-none")
  }
  expect(scrollRegion).toBeInTheDocument()
  expect(within(scrollRegion).getByRole("combobox", { name: "Style" })).toBeVisible()

  await user.click(screen.getByRole("tab", { name: "Colors" }))
  expect(within(scrollRegion).getByRole("button", { name: "Cloud Indigo" })).toBeVisible()
  expect(within(scrollRegion).queryByRole("combobox", { name: "Style" })).toBeNull()

  await user.click(screen.getByRole("tab", { name: "Layout" }))
  expect(within(scrollRegion).getByRole("switch", { name: "Fix header and tabs" })).toBeVisible()

  await user.click(screen.getByRole("tab", { name: "Experience" }))
  expect(within(scrollRegion).getByRole("switch", { name: "Restore tabs after refresh" })).toBeVisible()
  expect(screen.getByRole("button", { name: "Start preview" })).toBeVisible()
  expect(screen.queryByRole("textbox", { name: "Generated theme configuration" })).toBeNull()

  await user.click(screen.getByRole("button", { name: "Copy configuration" }))
  expect(writeText).toHaveBeenCalledOnce()
  expect(writeText.mock.calls[0]?.[0]).toContain("satisfies AdminThemeConfig")
})
