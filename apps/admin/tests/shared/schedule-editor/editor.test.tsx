// @vitest-environment jsdom
import "@test/setup/layout"
import { useState } from "react"
import { screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import i18n from "@/locales"
import { ScheduleEditor } from "@/shared/schedule-editor/editor"
import { createScheduleDraft, encodeSchedule } from "@/shared/schedule-editor/schedule-model"
import { useSchedulePreview, type PreviewLoader } from "@/shared/schedule-editor/use-schedule-preview"
const load: PreviewLoader = async () => ({
  valid: true,
  timezone: "Asia/Shanghai",
  evaluatedAt: "2026-10-24T12:00:00.123456+08:00",
  nextRuns: ["2026-10-24T12:00:01.123456+08:00"],
  horizonYears: 5,
})
function Editor({ disabled = false, loader = load }: { disabled?: boolean; loader?: PreviewLoader }) {
  const [value, setValue] = useState(createScheduleDraft),
    preview = useSchedulePreview(value, loader, ["editor-test"])
  return (
    <>
      <ScheduleEditor value={value} onChange={setValue} preview={preview} disabled={disabled} />
      <output aria-label="schedule">{JSON.stringify(encodeSchedule(value).value)}</output>
    </>
  )
}
async function select(name: string, label: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name }))
  await user.click(screen.getByRole("option", { name: label }))
  return user
}
test("fixed intervals offer seven units, presets, authoritative timestamps and subsecond precision", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  renderAdmin(<Editor />)
  await screen.findByText("Asia/Shanghai")
  await user.click(screen.getByRole("button", { name: "5 minutes" }))
  expect(screen.getByLabelText("schedule")).toHaveTextContent('"every":5,"period":"minutes"')
  await select("Time unit", "microseconds")
  await waitFor(() => expect(screen.getByText("2026-10-24 12:00:01.123456")).toBeInTheDocument())
  const count = screen.getByRole("spinbutton", { name: "Interval count" })
  await user.clear(count)
  expect(screen.getByRole("alert")).toHaveTextContent("positive integer")
  expect(screen.getByLabelText("schedule")).toHaveTextContent("null")
})
test("calendar modes keep an invalid advanced draft through type switches and never substitute a prior valid rule", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  renderAdmin(<Editor />)
  await user.click(screen.getByRole("button", { name: "Calendar" }))
  await user.click(screen.getByRole("button", { name: "Advanced" }))
  const input = screen.getByRole("textbox", { name: "Crontab expression" })
  await user.clear(input)
  await user.type(input, "1 2 3")
  expect(screen.getByRole("alert")).toHaveTextContent("five fields")
  await user.click(screen.getByRole("button", { name: "Solar event" }))
  await user.click(screen.getByRole("button", { name: "Calendar" }))
  expect(screen.getByRole("textbox", { name: "Crontab expression" })).toHaveValue("1 2 3")
  expect(screen.getByLabelText("schedule")).toHaveTextContent("null")
  await user.click(screen.getByRole("button", { name: "Weekly" }))
  await user.click(screen.getByRole("button", { name: "Weekend" }))
  expect(screen.getByLabelText("schedule")).toHaveTextContent('"dayOfWeek":"0,6"')
  await user.click(screen.getByRole("button", { name: "Monthly" }))
  await user.click(screen.getByRole("button", { name: "Day 31 of each month" }))
  expect(screen.getByLabelText("schedule")).toHaveTextContent('"dayOfMonth":"1,15,31"')
})
test("solar input explains hemisphere and missing coordinates block preview without becoming zero", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup()
  renderAdmin(<Editor />)
  await user.click(screen.getByRole("button", { name: "Solar event" }))
  const latitude = screen.getByRole("spinbutton", { name: "Latitude" }),
    longitude = screen.getByRole("spinbutton", { name: "Longitude" })
  await user.clear(latitude)
  await user.type(latitude, "-31.25")
  await user.clear(longitude)
  await user.type(longitude, "121.5")
  expect(screen.getByText(/31.25° S · 121.5° E/)).toBeInTheDocument()
  await user.clear(longitude)
  expect(screen.getByRole("alert")).toHaveTextContent("valid coordinates")
  expect(screen.getByLabelText("schedule")).toHaveTextContent("null")
})
test("semantic server errors identify a Cron field, while disabled controls keep the original draft", async () => {
  await i18n.changeLanguage("en-US")
  const user = userEvent.setup(),
    loader = vi.fn<PreviewLoader>().mockResolvedValue({
      valid: false,
      errorField: "minute",
      timezone: "Asia/Shanghai",
      evaluatedAt: "2026-10-24T12:00:00Z",
      nextRuns: [],
      horizonYears: 5,
    })
  const view = renderAdmin(<Editor loader={loader} />)
  await user.click(screen.getByRole("button", { name: "Calendar" }))
  await waitFor(() =>
    expect(screen.getByText("The Minute field is not a valid Celery Crontab rule.")).toBeInTheDocument(),
  )
  const before = screen.getByLabelText("schedule").textContent
  view.rerender(<Editor disabled loader={loader} />)
  const region = screen.getByRole("group", { name: "Schedule" })
  for (const button of within(region).getAllByRole("button")) expect(button).toBeDisabled()
  expect(screen.getByLabelText("schedule").textContent).toBe(before)
})
