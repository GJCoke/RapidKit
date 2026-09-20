// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { LayoutModeCard } from "@/features/theme/components/layout-mode-card"

test("exposes selected and disabled layout choices as radio cards", async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  const { rerender } = render(
    <LayoutModeCard mode="vertical" selected={true} disabled={false} label="垂直" onSelect={onSelect} />,
  )
  const card = screen.getByRole("radio", { name: "垂直" })
  expect(card).toHaveAttribute("aria-checked", "true")
  await user.click(card)
  expect(onSelect).toHaveBeenCalledWith("vertical")

  rerender(<LayoutModeCard mode="vertical" selected={false} disabled={true} label="垂直" onSelect={onSelect} />)
  expect(card).toBeDisabled()
})
