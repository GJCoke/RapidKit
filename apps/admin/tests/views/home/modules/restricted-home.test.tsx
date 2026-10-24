// @vitest-environment jsdom
import "@test/setup/layout"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
const base = "http://localhost:16000/api/v1"
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
async function setup(allowed: string[]) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("home-access", "home-ui-session")
  server.use(http.get(`${base}/dashboard/capabilities`, () => reply({ allowedModules: allowed, revision: "home" })))
  return userEvent.setup()
}
afterEach(() => {
  useAuthStore.getState().clearAuth()
  vi.restoreAllMocks()
})
import { RestrictedHome } from "@/views/home/modules/restricted-home"
test("restricted contacts show three then all, copy a named email, report failure and preserve expansion", async () => {
  const user = await setup([])
  const write = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } })
  server.use(
    http.get(`${base}/users/admin-contacts`, () =>
      reply(
        Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: `Admin ${i}`, email: `admin${i}@example.test` })),
      ),
    ),
  )
  renderAdmin(<RestrictedHome />)
  expect(await screen.findByText("Admin 0")).toBeInTheDocument()
  expect(screen.queryByText("Admin 3")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "View all administrators (4)" }))
  expect(screen.getByText("Admin 3")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Copy Admin 3's administrator email" }))
  expect(write).toHaveBeenCalledWith("admin3@example.test")
  expect(await screen.findByRole("status")).toHaveTextContent("Administrator Admin 3's email was copied")
  write.mockRejectedValueOnce(new Error("denied"))
  await user.click(screen.getByRole("button", { name: "Copy Admin 2's administrator email" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Copy failed")
  expect(screen.getByText("Admin 3")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Collapse administrators" }))
  expect(screen.queryByText("Admin 3")).not.toBeInTheDocument()
})
