import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const indexHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8")
const mainSource = await readFile(new URL("../../src/main.tsx", import.meta.url), "utf8")
const appSource = await readFile(new URL("../../src/app/App.tsx", import.meta.url), "utf8")
const authGuardSource = await readFile(
  new URL("../../src/features/auth/guards/auth-guard.tsx", import.meta.url),
  "utf8",
)

test("the first HTML paint contains the branded loading shell and top progress", () => {
  assert.match(indexHtml, /<div id="app"><\/div>/)
  assert.doesNotMatch(indexHtml, /app-bootstrap-loading/)
  assert.match(mainSource, /setupBootstrapLoading\(\)/)
  assert.match(appSource, /finishBootstrapLoading/)
  assert.match(appSource, /routeLoadState\.kind === "error"[\s\S]*finishBootstrapLoading\(\)/)
})

test("all React application loading boundaries share AppLoading", () => {
  assert.match(appSource, /useUserInfo/)
  assert.match(appSource, /<AppLoading \/>/)
  assert.match(authGuardSource, /<AppLoading \/>/)
  assert.doesNotMatch(appSource, /common\.loading/)
  assert.doesNotMatch(authGuardSource, /Loading\.\.\./)
})
