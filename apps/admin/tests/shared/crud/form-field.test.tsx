// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { FormField } from "@/shared/crud"

test("invalid fields expose validation state to the field container", () => {
  render(
    <FormField label="Name" htmlFor="name" error="Required">
      <input id="name" aria-invalid />
    </FormField>,
  )
  expect(screen.getByLabelText("Name").closest('[data-slot="field"]')).toHaveAttribute("data-invalid")
  expect(screen.getByText("Required")).toBeVisible()
})
