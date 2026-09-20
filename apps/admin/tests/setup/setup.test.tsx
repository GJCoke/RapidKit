// @vitest-environment jsdom

import { http, HttpResponse } from "msw"
import { test, expect } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"

import { server } from "./server"

test("browser test setup provides DOM matchers, user events, and MSW", async () => {
  server.use(http.get("http://localhost/test-health", () => HttpResponse.json({ ok: true })))
  const user = userEvent.setup()

  render(<button type="button">Run check</button>)
  const button = screen.getByRole("button", { name: "Run check" })
  await user.click(button)
  const response = await fetch("http://localhost/test-health")

  expect(button).toBeInTheDocument()
  await expect(response.json()).resolves.toEqual({ ok: true })
})
