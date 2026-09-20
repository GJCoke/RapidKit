// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { createMemoryRouter, RouterProvider } from "react-router"
import { expect, test } from "vitest"

import { RouteErrorBoundary } from "@/features/router/route-error-boundary"
import i18n from "@/locales"

function BrokenPage(): never {
  throw new Error("render failed")
}

test("renders a recoverable route error instead of a blank screen", async () => {
  const router = createMemoryRouter(
    [
      {
        path: "/broken",
        element: <BrokenPage />,
        errorElement: <RouteErrorBoundary />,
      },
    ],
    { initialEntries: ["/broken"] },
  )

  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  )

  expect(await screen.findByRole("alert")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "返回首页" })).toBeInTheDocument()
  expect(screen.getByText("Error")).toBeInTheDocument()
})
