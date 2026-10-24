import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/final-transition/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true })
const results = []
async function until(check, message) {
  const deadline = Date.now() + 20000
  while (!(await check())) {
    assert(Date.now() < deadline, message)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
try {
  for (const account of ["admin", "guest"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => {
      window.__routeAnimationEnds = 0
      document.addEventListener(
        "animationend",
        (event) => {
          if (event.target instanceof Element && event.target.matches("[data-route-transition]")) {
            window.__routeAnimationEnds++
            event.stopImmediatePropagation()
          }
        },
        true,
      )
    })
    const page = await context.newPage()
    const errors = [],
      consoleErrors = [],
      failures = [],
      writes = []
    let closing = false,
      roleReads = 0
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("requestfailed", (request) => {
      if (!closing && request.failure()?.errorText !== "net::ERR_ABORTED") failures.push(request.failure()?.errorText)
    })
    page.on("request", (request) => {
      if (/\/api\/v1\/roles(?:\?|$)/.test(request.url()) && request.method() === "GET") roleReads++
      if (
        /\/api\/v1\//.test(request.url()) &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        !/\/auth\/(?:login|refresh)(?:\?|$)/.test(request.url())
      )
        writes.push({ url: request.url(), method: request.method() })
    })
    const frame = () => page.locator("[data-route-transition]")
    async function settle() {
      await until(
        () =>
          frame().evaluate(
            (node) =>
              node.dataset.routeTransition === "idle" && node.dataset.routePath === location.pathname + location.search,
          ),
        "the latest page must complete without native animationend",
      )
      await page.locator("#nprogress").waitFor({ state: "hidden" })
    }
    async function spa(path) {
      await page.evaluate((path) => {
        history.pushState(history.state, "", path)
        dispatchEvent(new PopStateEvent("popstate", { state: history.state }))
      }, path)
      await page.waitForURL((url) => url.pathname === path)
    }
    try {
      await page.goto("http://localhost:3100/login")
      await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
      await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
      await page.getByRole("button", { name: "登录", exact: true }).click()
      await page.waitForURL((url) => url.pathname === "/home")
      await settle()
      await spa("/manage/user")
      await settle()
      await spa("/manage/role")
      await page.locator('[data-route-transition="exiting"]').waitFor()
      assert(
        await frame().evaluate((node) =>
          node.getAnimations().some((animation) => animation.playState === "running" || animation.pending),
        ),
      )
      await spa("/manage/menu")
      await settle()
      await page.locator("main").getByRole("heading", { name: "菜单列表", exact: true }).waitFor()
      await spa("/manage/role")
      await settle()
      await page.locator("main").getByRole("cell", { name: "ADMIN", exact: true }).waitFor()
      await page.locator("#role-keyword").fill("discarded on page refresh")
      const before = roleReads
      await page.getByRole("button", { name: "刷新当前页面", exact: true }).click()
      await until(() => roleReads > before, "page refresh remounts and reads once")
      await settle()
      await page.locator("main").getByRole("cell", { name: "ADMIN", exact: true }).waitFor()
      assert.equal(await page.locator("#role-keyword").inputValue(), "")
      assert.equal(roleReads - before, 1)
      const blockedNativeEnds = await page.evaluate(() => window.__routeAnimationEnds)
      assert(blockedNativeEnds > 0, "real native animationend events were blocked while completion still worked")
      assert.deepEqual(errors, [])
      assert.deepEqual(consoleErrors, [])
      assert.deepEqual(failures, [])
      assert.deepEqual(writes, [])
      await page.screenshot({ path: fileURLToPath(new URL(`${account}-rapid-and-refresh.png`, shots)), fullPage: true })
      results.push({
        account,
        blockedNativeEnds,
        refreshReads: roleReads - before,
        errors,
        consoleErrors,
        failures,
        writes,
      })
      console.log(
        account,
        "real CSS completion without native events, rapid latest navigation, and one-read page refresh passed",
      )
    } catch (error) {
      results.push({ account, error: String(error), errors, consoleErrors, failures, writes })
      console.error(account, error)
    } finally {
      closing = true
      await context.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(new URL("final-transition-browser-results.json", output), JSON.stringify(results, null, 2) + "\n")
}
assert(results.every((result) => !result.error))
