// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { CrudDrawer } from "@/shared/crud/crud-drawer"
import { FormField } from "@/shared/crud/form-field"
import { ConfirmActionDialog } from "@/shared/crud/confirm-action-dialog"

test("form field connects its label and exposes validation feedback", () => {
  renderAdmin(
    <FormField label="用户名" htmlFor="username" required error="用户名必填">
      <input id="username" />
    </FormField>,
  )
  expect(screen.getByLabelText("用户名*")).toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("用户名必填")
})

test("crud drawer has an accessible title and blocks duplicate submit", async () => {
  const submit = vi.fn()
  renderAdmin(
    <CrudDrawer open onOpenChange={vi.fn()} title="新增用户" description="填写用户信息" submitting onSubmit={submit}>
      <div>表单内容</div>
    </CrudDrawer>,
  )
  expect(screen.getByRole("dialog", { name: "新增用户" })).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "提交中…" }))
  expect(submit).not.toHaveBeenCalled()
})

test("confirmation dialog only runs a destructive action after confirmation", async () => {
  const confirm = vi.fn()
  renderAdmin(
    <ConfirmActionDialog
      open
      onOpenChange={vi.fn()}
      title="删除用户"
      description="该操作不可撤销"
      onConfirm={confirm}
    />,
  )
  await userEvent.click(screen.getByRole("button", { name: "确认" }))
  expect(confirm).toHaveBeenCalledOnce()
})
