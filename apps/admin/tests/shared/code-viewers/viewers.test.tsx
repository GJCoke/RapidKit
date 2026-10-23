// @vitest-environment jsdom
import "@test/setup/layout"
import { screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import i18n from "@/locales"
import { JsonViewer } from "@/shared/code-viewers/json-viewer"
import { LogViewer } from "@/shared/code-viewers/log-viewer"
import * as actions from "@/shared/code-viewers/text-actions"
test("JSON copy and download use the exact displayed value; replacing it discards old feedback", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup(),
    copy = vi.spyOn(actions, "copyText").mockResolvedValue(),
    download = vi.spyOn(actions, "downloadText").mockImplementation(() => {})
  const view = renderAdmin(<JsonViewer value={{ message: "<script>x</script>" }} filename="result.json" />)
  await user.click(screen.getByRole("button", { name: "Copy" }))
  expect(copy).toHaveBeenCalledWith(JSON.stringify({ message: "<script>x</script>" }, null, 2))
  expect(screen.getByRole("status")).toHaveTextContent("JSON copied")
  await user.click(screen.getByRole("button", { name: "Download JSON" }))
  expect(download).toHaveBeenCalledWith(
    JSON.stringify({ message: "<script>x</script>" }, null, 2),
    "result.json",
    "application/json;charset=utf-8",
  )
  view.rerender(<JsonViewer value={undefined} />)
  expect(screen.queryByRole("status")).toBeNull()
  expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled()
})
test("logs filter retained entries by level and text and export only the current result", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup(),
    copy = vi.spyOn(actions, "copyText").mockResolvedValue(),
    download = vi.spyOn(actions, "downloadText").mockImplementation(() => {})
  renderAdmin(
    <LogViewer
      records={[
        { id: 0, message: "evicted" },
        { id: 1, message: "ready", level: "INFO" },
        { id: 2, message: "failed", level: "ERROR" },
      ]}
      maxEntries={2}
      filename="safe.log"
    />,
  )
  expect(screen.getByText(/1 omitted/)).toBeInTheDocument()
  await user.type(screen.getByRole("textbox", { name: "Search log content" }), "FAIL")
  expect(within(screen.getByRole("log")).queryByText("ready")).toBeNull()
  await user.click(screen.getByRole("button", { name: "Copy" }))
  expect(copy).toHaveBeenCalledWith("[ERROR] failed")
  await user.click(screen.getByRole("button", { name: "Export" }))
  expect(download).toHaveBeenCalledWith("[ERROR] failed", "safe.log")
  await user.type(screen.getByRole("textbox", { name: "Search log content" }), "none")
  expect(screen.getByText("No matching logs")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Export" })).toBeDisabled()
})
test("paused logs count matching appends and replacement resets follow", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup(),
    rows = [{ id: 1, message: "one" }]
  const view = renderAdmin(<LogViewer records={rows} sourceKey="a" />)
  await user.click(screen.getByRole("button", { name: "Auto-follow" }))
  view.rerender(<LogViewer records={[...rows, { id: 2, message: "two" }]} sourceKey="a" />)
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "1 new entries / Jump to bottom" })).toBeInTheDocument(),
  )
  view.rerender(<LogViewer records={[{ id: 1, message: "different" }]} sourceKey="b" />)
  expect(screen.getByRole("button", { name: "Auto-follow" })).toHaveAttribute("aria-pressed", "true")
})

test("changing retention clears pending counts while preserving an intentionally paused reader", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup(),
    rows = [{ id: 1, message: "one" }],
    view = renderAdmin(<LogViewer records={rows} maxEntries={5} />)
  await user.click(screen.getByRole("button", { name: "Auto-follow" }))
  const appended = [...rows, { id: 2, message: "two" }]
  view.rerender(<LogViewer records={appended} maxEntries={5} />)
  expect(screen.getByRole("button", { name: "1 new entries / Jump to bottom" })).toBeInTheDocument()
  view.rerender(<LogViewer records={appended} maxEntries={1} />)
  expect(screen.getByRole("button", { name: "Jump to bottom" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Auto-follow" })).toHaveAttribute("aria-pressed", "false")
})

test("late clipboard completion cannot attach feedback to a different JSON value", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.spyOn(actions, "copyText").mockReturnValue(gate)
  const view = renderAdmin(<JsonViewer value={{ version: 1 }} />)
  await user.click(screen.getByRole("button", { name: "Copy" }))
  view.rerender(<JsonViewer value={{ version: 2 }} />)
  release()
  await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled())
  expect(screen.queryByText("JSON copied")).toBeNull()
  expect(screen.getByText("2", { exact: true, selector: "code span" })).toBeInTheDocument()
})

test("JSON copy/download failures remain visible and display controls preserve the exact export", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  vi.spyOn(actions, "copyText").mockRejectedValue(new Error("unavailable"))
  vi.spyOn(actions, "downloadText").mockImplementation(() => {
    throw new Error("unavailable")
  })
  renderAdmin(<JsonViewer value={{ message: "literal" }} />)
  await user.click(screen.getByRole("checkbox", { name: "Wrap lines" }))
  await user.click(screen.getByRole("checkbox", { name: "Line numbers" }))
  expect(screen.getByRole("checkbox", { name: "Wrap lines" })).not.toBeChecked()
  expect(screen.getByRole("checkbox", { name: "Line numbers" })).not.toBeChecked()
  await user.click(screen.getByRole("button", { name: "Copy" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Copy failed")
  await user.click(screen.getByRole("button", { name: "Download JSON" }))
  expect(screen.getByRole("alert")).toHaveTextContent("Download failed")
})
