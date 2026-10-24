// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Route, Routes } from "react-router"
import { afterEach, expect, test } from "vitest"
import { renderAdmin } from "@test/setup/render"
import i18n from "@/locales"
import Forbidden from "@/shared/pages/403"
import NotFound from "@/shared/pages/404"
import ServerError from "@/shared/pages/500"

afterEach(async () => {
  await i18n.changeLanguage("zh-CN")
})
for (const language of ["zh-CN", "en-US"])
  test.each([
    { code: "403", Page: Forbidden },
    { code: "404", Page: NotFound },
    { code: "500", Page: ServerError },
  ])(`${language} $code explains the error and navigates back to the actual home`, async ({ code, Page }) => {
    await i18n.changeLanguage(language)
    const user = userEvent.setup()
    renderAdmin(
      <Routes>
        <Route path={`/${code}`} element={<Page />} />
        <Route path="/" element={<h1>Home destination</h1>} />
      </Routes>,
      { initialEntries: [`/${code}`] },
    )
    expect(screen.getByRole("heading", { name: code })).toBeInTheDocument()
    expect(document.title).not.toContain("route.")
    expect(document.title).toBe(`${i18n.t(`route.${code}`)} - ${i18n.t("system.title")}`)
    expect(screen.getByText(i18n.t(`error.${code}`))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: i18n.t("state.retry") })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("state.backHome") }))
    expect(await screen.findByRole("heading", { name: "Home destination" })).toBeInTheDocument()
  })
