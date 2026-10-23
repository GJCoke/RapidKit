// @vitest-environment jsdom
import "@test/setup/layout"
import { useState } from "react"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { renderAdmin } from "@test/setup/render"
import i18n from "@/locales"
import {
  PythonArgumentsEditor,
  createArgumentDraft,
  parseArgumentDraft,
  type ArgumentDraft,
} from "@/shared/python-arguments/editor"
import { PythonArgumentsViewer } from "@/shared/python-arguments/viewer"
function Editor() {
  const [value, setValue] = useState<ArgumentDraft>(() => createArgumentDraft({ args: ["one", "two"], kwargs: {} }))
  const result = parseArgumentDraft(value)
  return (
    <>
      <PythonArgumentsEditor value={value} onChange={setValue} functionName="job" />
      <button disabled={!result.value}>Submit</button>
      <output aria-label="payload">{JSON.stringify(result.value)}</output>
    </>
  )
}
test("positional moves and removal update payload order without mutating the other row", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  renderAdmin(<Editor />)
  const args = screen.getByRole("region", { name: "Positional arguments" })
  await user.click(within(args).getAllByRole("button", { name: "Move down" })[0])
  expect(screen.getByLabelText("payload")).toHaveTextContent('{"args":["two","one"],"kwargs":{}}')
  await user.click(within(args).getAllByRole("button", { name: "Delete" })[0])
  expect(screen.getByLabelText("payload")).toHaveTextContent('{"args":["one"],"kwargs":{}}')
})
test("invalid numbers and duplicate keyword keys prevent submission rather than retaining an old valid value", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  renderAdmin(<Editor />)
  const args = screen.getByRole("region", { name: "Positional arguments" })
  await user.click(within(args).getAllByRole("combobox", { name: "Value type" })[0])
  await user.click(screen.getByRole("option", { name: "Number" }))
  const input = within(args).getAllByRole("textbox", { name: "Argument value" })[0]
  await user.clear(input)
  await user.type(input, "9007199254740992")
  expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled()
  expect(screen.getByRole("alert")).toHaveTextContent("args[0]")
  await user.clear(input)
  await user.type(input, "2.5")
  expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled()
  const kwargs = screen.getByRole("region", { name: "Keyword arguments" })
  await user.click(within(kwargs).getByRole("button", { name: "Add argument" }))
  await user.type(within(kwargs).getByRole("textbox", { name: "Keyword name" }), "same")
  await user.click(within(kwargs).getByRole("button", { name: "Add argument" }))
  await user.type(within(kwargs).getAllByRole("textbox", { name: "Keyword name" })[1], "same")
  expect(screen.getByRole("alert")).toHaveTextContent("must be unique")
  expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled()
})
test("readonly arguments expose Python types, nested values lazily, and a call preview", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  renderAdmin(
    <PythonArgumentsViewer
      value={{ args: [null, true, ["nested"]], kwargs: { option: { value: 2 } } }}
      functionName="job"
    />,
  )
  expect(screen.getAllByText("None")).toHaveLength(2)
  expect(screen.queryByText('"nested"')).toBeNull()
  await user.click(screen.getByRole("button", { name: /args\[2\]/ }))
  expect(screen.getByText('"nested"')).toBeInTheDocument()
  await user.click(screen.getByText("Python call preview"))
  expect(screen.getByText("job", { exact: false })).toBeInTheDocument()
})
