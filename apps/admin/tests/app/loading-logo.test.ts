import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const loadingLogo = await readFile(new URL("../../public/logo-loading.svg", import.meta.url), "utf8")
const bootstrapLoading = await readFile(new URL("../../src/app/bootstrap-loading.ts", import.meta.url), "utf8")
const appLoading = await readFile(new URL("../../src/app/app-loading.tsx", import.meta.url), "utf8")
const indexHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8")

test("admin loading surfaces use one animated logo while the favicon stays static", () => {
  assert.match(loadingLogo, /@keyframes soft-pulse/)
  assert.match(loadingLogo, /animateTransform/)
  assert.match(loadingLogo, /prefers-reduced-motion:\s*reduce/)
  assert.match(loadingLogo, /<mask[^>]+>[\s\S]*<path d=/)
  assert.doesNotMatch(loadingLogo, /<image[^>]+href="\/favicon\.svg"/)
  assert.match(bootstrapLoading, /\/logo-loading\.svg/)
  assert.match(appLoading, /\/logo-loading\.svg/)
  assert.match(indexHtml, /href="\/favicon\.svg"/)
})
