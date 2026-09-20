// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { AppLoading } from "@/app/app-loading"

test("app loading shows only the product logo and application name", () => {
  render(<AppLoading />)

  expect(screen.getByRole("img", { name: "RapidKit" })).toHaveAttribute("src", "/logo-loading.svg")
  expect(screen.getByRole("heading", { name: "RapidKit Admin" })).toBeInTheDocument()
  expect(screen.queryByText(/loading|加载中/i)).not.toBeInTheDocument()
  expect(document.querySelector("#nprogress")).not.toBeNull()
})
