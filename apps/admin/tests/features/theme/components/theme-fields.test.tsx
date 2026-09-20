// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { ThemeSelect } from "@/features/theme/components/theme-fields"

test("ThemeSelect opens the shadcn popup and reports the selected configuration value", async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <ThemeSelect
      label="Motion preset"
      value="fade"
      options={[
        { value: "fade", label: "淡入" },
        { value: "fade-slide", label: "淡入并滑动" },
      ]}
      onChange={onChange}
    />,
  )

  const trigger = screen.getByRole("combobox", { name: "Motion preset" })
  expect(trigger).toHaveAttribute("data-slot", "select-trigger")

  await user.click(trigger)
  await user.click(screen.getByRole("option", { name: "淡入并滑动" }))

  expect(onChange).toHaveBeenCalledWith("fade-slide")
})

test("ThemeSelect disables its shadcn trigger", () => {
  render(<ThemeSelect label="Motion preset" value="fade" options={["fade"]} disabled onChange={() => undefined} />)

  expect(screen.getByRole("combobox", { name: "Motion preset" })).toBeDisabled()
})
