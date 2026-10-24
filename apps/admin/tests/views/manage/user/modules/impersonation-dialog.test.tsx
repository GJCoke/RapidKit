// @vitest-environment jsdom
import "@test/setup/layout"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { impersonationSession, useImpersonationStore } from "@/features/auth/impersonation-runtime"
import { ImpersonationDialog } from "@/views/manage/user/modules/impersonation-dialog"
import type { User } from "@/services/api/user"
import i18n from "@/locales"

const target: User = {
  id: "subject",
  username: "subject",
  name: "Subject",
  email: "",
  status: "1",
  roles: ["READER"],
  departmentId: "dep",
  isAdmin: false,
  createTime: "",
  updateTime: "",
}
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
afterEach(() => {
  useAuthStore.getState().clearAuth()
  useImpersonationStore.setState({ snapshot: null, transitionSession: null })
  vi.restoreAllMocks()
})
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("actor-access", "dialog-actor-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "actor",
      name: "Actor",
      username: "actor",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: true,
      roles: [],
      buttons: [],
    },
  })
  return userEvent.setup()
}
test("confirmation includes target roles/department and optional reason; failures preserve the reason for retry", async () => {
  const user = await setup(),
    onOpenChange = vi.fn()
  const start = vi.spyOn(impersonationSession, "enter").mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  window.history.replaceState({}, "", "/manage/user?status=1")
  renderAdmin(<ImpersonationDialog open onOpenChange={onOpenChange} user={target} departmentName="Org / Research" />)
  const dialog = screen.getByRole("dialog", { name: "Confirm impersonation" })
  expect(within(dialog).getByText("Subject (subject)")).toBeInTheDocument()
  expect(within(dialog).getByText("READER")).toBeInTheDocument()
  expect(within(dialog).getByText("Org / Research")).toBeInTheDocument()
  const reason = screen.getByRole("textbox", { name: "Reason (optional)" })
  expect(reason).toHaveAttribute("maxlength", "500")
  await user.type(reason, "  Investigate access  ")
  await user.click(screen.getByRole("button", { name: "Start impersonation" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to start impersonation. Please retry.")
  expect(reason).toHaveValue("  Investigate access  ")
  expect(onOpenChange).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Start impersonation" }))
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(start).toHaveBeenNthCalledWith(
    2,
    { targetUserId: "subject", reason: "Investigate access" },
    "/manage/user?status=1",
  )
  window.history.replaceState({}, "", "/")
})
test("pending creation cannot be duplicated or dismissed; permission loss removes the confirmation", async () => {
  const user = await setup(),
    onOpenChange = vi.fn()
  let resolve!: (value: boolean) => void
  const start = vi.spyOn(impersonationSession, "enter").mockReturnValue(
    new Promise<boolean>((r) => {
      resolve = r
    }),
  )
  renderAdmin(<ImpersonationDialog open onOpenChange={onOpenChange} user={target} />)
  const submit = screen.getByRole("button", { name: "Start impersonation" })
  await user.click(submit)
  await user.click(submit)
  expect(start).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  await user.keyboard("{Escape}")
  expect(onOpenChange).not.toHaveBeenCalled()
  act(() => useAuthStore.setState((state) => ({ userInfo: state.userInfo && { ...state.userInfo, isAdmin: false } })))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await act(async () => resolve(true))
  expect(onOpenChange).not.toHaveBeenCalled()
})
