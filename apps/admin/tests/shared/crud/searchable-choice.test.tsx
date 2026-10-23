// @vitest-environment jsdom
import "@test/setup/layout"
import { useState } from "react"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import i18n from "@/locales"
import { SearchableChoice } from "@/shared/crud/searchable-choice"
function Choice() {
  const [value, setValue] = useState<string | null>(null)
  return (
    <>
      <SearchableChoice
        label="Recipient"
        value={value}
        onChange={setValue}
        options={[
          { value: "reader", label: "Reader" },
          { value: "operator", label: "Operator" },
          { value: "disabled", label: "Disabled", disabled: true },
        ]}
      />
      <output aria-label="Chosen">{value}</output>
    </>
  )
}
test("a searchable choice filters real options, selects a value, and restores focus after Escape", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  renderAdmin(<Choice />)
  const trigger = screen.getByRole("combobox", { name: "Recipient" })
  await user.click(trigger)
  const dialog = screen.getByRole("dialog", { name: "Recipient" })
  await user.type(within(dialog).getByRole("combobox"), "Operator")
  expect(within(dialog).queryByRole("option", { name: "Reader" })).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole("option", { name: "Operator" }))
  expect(screen.getByLabelText("Chosen")).toHaveTextContent("operator")
  await user.click(trigger)
  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})

test("required selections hide clearing while existing callers keep their clear action", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup(),
    change = vi.fn()
  const props = { label: "Message", value: "reader", options: [{ value: "reader", label: "Reader" }], onChange: change }
  const view = renderAdmin(<SearchableChoice {...props} clearable={false} />)
  await user.click(screen.getByRole("combobox", { name: "Message" }))
  expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()
  await user.keyboard("{Escape}")
  view.rerender(<SearchableChoice {...props} />)
  await user.click(screen.getByRole("combobox", { name: "Message" }))
  await user.click(screen.getByRole("button", { name: "Reset" }))
  expect(change).toHaveBeenCalledWith(null)
})
