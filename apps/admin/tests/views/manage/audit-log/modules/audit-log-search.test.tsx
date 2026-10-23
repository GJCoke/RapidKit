// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import i18n from "@/locales"
import { AuditLogSearch } from "@/views/manage/audit-log/modules/audit-log-search"
test("audit search interprets datetime input in the catalog timezone and rejects incomplete ranges", async () => {
  await i18n.changeLanguage("en-US")
  const apply = vi.fn(),
    user = userEvent.setup()
  renderAdmin(
    <AuditLogSearch
      catalog={{ timezone: "Asia/Shanghai", actions: [] }}
      state={{
        filters: { startTime: "2026-10-21T10:00:00Z", endTime: "2026-10-21T11:00:00Z" },
        timeRange: "custom",
        selectedAuditId: null,
      }}
      onApply={apply}
    />,
  )
  const start = screen.getByLabelText("From"),
    end = screen.getByLabelText("To")
  expect(start).toHaveValue("2026-10-21T18:00")
  await user.clear(end)
  await user.click(screen.getByRole("button", { name: "Search" }))
  expect(apply).not.toHaveBeenCalled()
  expect(screen.getAllByText("Enter valid start and end times, with the end after the start.")).toHaveLength(2)
})

test("invalid identity identifiers remain in the draft and cannot silently broaden a search", async () => {
  await i18n.changeLanguage("en-US")
  const apply = vi.fn(),
    user = userEvent.setup()
  renderAdmin(
    <AuditLogSearch
      catalog={{ timezone: "Asia/Shanghai", actions: [] }}
      state={{ filters: {}, timeRange: "all", selectedAuditId: null }}
      onApply={apply}
    />,
  )
  await user.click(screen.getByText("More filters"))
  await user.type(screen.getByRole("textbox", { name: "Target user ID" }), "invalid-id")
  await user.click(screen.getByRole("button", { name: "Search" }))
  expect(apply).not.toHaveBeenCalled()
  expect(screen.getByRole("textbox", { name: "Target user ID" })).toHaveValue("invalid-id")
  expect(screen.getByText("Enter a valid user or session UUID.")).toBeVisible()
})

test("clearing both custom times searches all history instead of restoring the default day", async () => {
  await i18n.changeLanguage("en-US")
  const apply = vi.fn(),
    user = userEvent.setup()
  renderAdmin(
    <AuditLogSearch
      catalog={{ timezone: "Asia/Shanghai", actions: [] }}
      state={{
        filters: { startTime: "2026-10-21T10:00:00Z", endTime: "2026-10-21T11:00:00Z" },
        timeRange: "custom",
        selectedAuditId: null,
      }}
      onApply={apply}
    />,
  )
  await user.clear(screen.getByLabelText("From"))
  await user.clear(screen.getByLabelText("To"))
  await user.click(screen.getByRole("button", { name: "Search" }))
  expect(apply).toHaveBeenCalledWith({ startTime: undefined, endTime: undefined }, "all")
})
