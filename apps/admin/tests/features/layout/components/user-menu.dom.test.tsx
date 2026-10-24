// @vitest-environment jsdom
import "@test/setup/layout"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { UserMenu } from "@/features/layout/components/user-menu"
import { impersonationSession, useImpersonationStore } from "@/features/auth/impersonation-runtime"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"

Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
afterEach(() => {
  useImpersonationStore.setState({ snapshot: null, transitionSession: null })
  useAuthStore.getState().clearAuth()
  vi.restoreAllMocks()
})
test("an active simulation has an always available exit, snapshot, countdown and restoration/audit guidance instead of logout", async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.setState({
    userInfo: {
      id: "subject",
      username: "subject",
      name: "Subject",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: false,
      roles: [],
      buttons: [],
    },
  })
  useImpersonationStore.setState({
    snapshot: {
      sessionId: "s1",
      subject: { id: "subject", name: "Subject", username: "subject" },
      expiresAt: new Date(Date.now() + 610_000).toISOString(),
    },
  })
  const user = userEvent.setup()
  let finish!: () => void
  const stop = vi.spyOn(impersonationSession, "stop").mockReturnValue(
    new Promise<void>((r) => {
      finish = r
    }),
  )
  renderAdmin(<UserMenu />)
  const exit = screen.getByRole("button", { name: "Exit impersonation" })
  await user.click(screen.getByRole("button", { name: "User menu" }))
  expect(await screen.findByText("Impersonating user")).toBeInTheDocument()
  expect(screen.getByText("@subject")).toBeInTheDocument()
  expect(screen.getByLabelText("Time remaining")).toHaveTextContent(/^10:[0-5]\d$/)
  expect(screen.getByLabelText("Expires at")).not.toHaveTextContent("—")
  expect(screen.getByText("Exit to restore your administrator identity.")).toBeInTheDocument()
  expect(screen.getByText("Actions during this session are recorded in the audit log.")).toBeInTheDocument()
  expect(screen.queryByRole("menuitem", { name: "Logout" })).not.toBeInTheDocument()
  await user.keyboard("{Escape}")
  await user.click(exit)
  await user.click(exit)
  expect(stop).toHaveBeenCalledTimes(1)
  expect(exit).toBeDisabled()
  await act(async () => finish())
  await waitFor(() => expect(exit).toBeEnabled())
})
test("a normal identity keeps logout and does not show simulated identity controls", async () => {
  await i18n.changeLanguage("zh-CN")
  renderAdmin(<UserMenu />)
  expect(screen.queryByRole("button", { name: "退出模拟登录" })).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole("button", { name: "用户菜单" }))
  expect(await screen.findByRole("menuitem", { name: "退出登录" })).toBeInTheDocument()
})
