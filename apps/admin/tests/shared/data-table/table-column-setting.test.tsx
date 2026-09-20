// @vitest-environment jsdom
import { useState } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { TableColumnSetting, type TableColumnSettingItem } from "@/shared/data-table/table-column-setting"

const columns: TableColumnSettingItem[] = [
  { id: "select", title: "选择", hideable: false },
  { id: "name", title: "姓名", hideable: true, pinnable: true },
  { id: "email", title: "邮箱", hideable: true, pinnable: true },
]

function Harness() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [order, setOrder] = useState(columns.map((column) => column.id))
  const [pinning, setPinning] = useState<{ left?: string[]; right?: string[] }>({})
  return (
    <TableColumnSetting
      columns={columns}
      visibility={visibility}
      order={order}
      pinning={pinning}
      onVisibilityChange={setVisibility}
      onOrderChange={setOrder}
      onPinningChange={setPinning}
    />
  )
}

test("column setting hides hideable columns and cycles pinning", async () => {
  const user = userEvent.setup()
  renderAdmin(<Harness />)
  await user.click(screen.getByRole("button", { name: "列设置" }))
  await user.click(screen.getByRole("checkbox", { name: "姓名" }))
  expect(screen.getByRole("checkbox", { name: "姓名" })).not.toBeChecked()
  await user.click(screen.getByRole("button", { name: "固定姓名" }))
  expect(screen.getByText("左")).toBeInTheDocument()
})
