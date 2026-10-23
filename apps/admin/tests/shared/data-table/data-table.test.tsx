// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Checkbox } from "@rapidkit/ui"
import { expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import type { DataTableColumn } from "@/shared/data-table/types"
import { DataTable } from "@/shared/data-table/data-table"

type Row = { id: string; name: string }
const columns: DataTableColumn<Row>[] = [
  {
    id: "select",
    size: 40,
    header: ({ table }) => (
      <Checkbox
        aria-label="选择当前页"
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`选择${row.original.name}`}
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
  },
  { accessorKey: "name", id: "name", header: "姓名", cell: ({ row }) => row.original.name },
]

test("data table renders records and reports controlled row selection", async () => {
  const onSelection = vi.fn()
  renderAdmin(
    <DataTable
      columns={columns}
      data={[{ id: "1", name: "Ada" }]}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: 10, total: 1 }}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
      onRowSelectionChange={onSelection}
    />,
  )
  expect(screen.getByText("Ada")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("checkbox", { name: "选择Ada" }))
  expect(onSelection).toHaveBeenCalledWith({ "1": true })
})

test("data table exposes empty and recoverable error states", async () => {
  const retry = vi.fn()
  const props = {
    columns,
    data: [] as Row[],
    getRowId: (row: Row) => row.id,
    pagination: { page: 1, pageSize: 10, total: 0 },
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  }
  const view = renderAdmin(<DataTable {...props} emptyText="没有用户" />)
  expect(screen.getByText("没有用户")).toBeInTheDocument()
  view.rerender(<DataTable {...props} error onRetry={retry} />)
  await userEvent.click(screen.getByRole("button", { name: "重试" }))
  expect(retry).toHaveBeenCalledOnce()
})

test("optional row activation supports pointer and Enter without consuming interactive controls", async () => {
  const user = userEvent.setup(),
    activate = vi.fn()
  renderAdmin(
    <DataTable
      columns={columns}
      data={[{ id: "1", name: "Ada" }]}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: 10, total: 1 }}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
      onRowActivate={activate}
    />,
  )
  const row = screen.getByText("Ada").closest("tr")!
  await user.click(screen.getByText("Ada"))
  expect(activate).toHaveBeenCalledWith({ id: "1", name: "Ada" })
  row.focus()
  await user.keyboard("{Enter}")
  expect(activate).toHaveBeenCalledTimes(2)
  await user.click(screen.getByRole("checkbox", { name: "选择Ada" }))
  expect(activate).toHaveBeenCalledTimes(2)
})

test("row activation accepts Space and prevents page scrolling", async () => {
  const activate = vi.fn(),
    user = userEvent.setup()
  renderAdmin(
    <DataTable
      columns={columns}
      data={[{ id: "1", name: "Ada" }]}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: 10, total: 1 }}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
      onRowActivate={activate}
    />,
  )
  screen.getByText("Ada").closest("tr")!.focus()
  await user.keyboard(" ")
  expect(activate).toHaveBeenCalledExactlyOnceWith({ id: "1", name: "Ada" })
})
