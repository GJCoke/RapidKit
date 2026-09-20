// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { ChromeTabBackground } from "@/features/layout/components/chrome-tab-background"

test("uses frontend's two-half scalable Chrome geometry", () => {
  render(<ChromeTabBackground />)

  const background = screen.getByTestId("chrome-tab-background")
  expect(background).toHaveAttribute("aria-hidden", "true")
  expect(background).not.toHaveAttribute("viewBox", "0 0 428 36")
  expect(background).not.toHaveAttribute("preserveAspectRatio", "none")
  const geometry = background.querySelector("symbol")
  expect(geometry).toHaveAttribute("viewBox", "0 0 214 36")

  const leftHalf = background.querySelector(":scope > svg")
  expect(leftHalf).toHaveAttribute("width", "51%")
  expect(leftHalf).toHaveAttribute("height", "100%")

  const rightHalf = background.querySelector('g[transform="scale(-1, 1)"] > svg')
  expect(rightHalf).toHaveAttribute("width", "51%")
  expect(rightHalf).toHaveAttribute("height", "100%")
  expect(rightHalf).toHaveAttribute("x", "-100%")
  expect(rightHalf).toHaveAttribute("y", "0")
})
