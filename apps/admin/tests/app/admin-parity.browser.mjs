import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const output = new URL("../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const screenshots = new URL("screenshots/foundation/", output)
await mkdir(screenshots, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
})
const results = []

async function login(page, target, account) {
  const origin = target === "admin" ? "http://localhost:3100" : "http://localhost:9527"
  await page.goto(`${origin}/login`)
  await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
  await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
  await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))
  await page.goto(`${origin}/manage/user`)
  await page.getByRole("cell").filter({ hasText: account }).first().waitFor()
}

try {
  for (const account of ["admin", "guest"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    for (const target of ["frontend", "admin"]) {
      const page = await context.newPage()
      const errors = []
      const failedRequests = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failedRequests.push({ url: request.url().split("?")[0], error: request.failure()?.errorText })
      })
      try {
        await login(page, target, account)
        const create = page.getByRole("button", { name: "新增用户", exact: true })
        assert.equal(await create.count(), account === "admin" ? 1 : 0, `${target}: create permission`)
        if (account === "guest") {
          assert.equal(await page.getByRole("button", { name: "编辑", exact: true }).count(), 0)
          assert.match(await page.locator("body").innerText(), /g\*+@gmail\.com/)
        }
        await page.screenshot({
          path: fileURLToPath(new URL(`${target}-${account}-desktop.png`, screenshots)),
          fullPage: true,
        })
        if (target === "admin") {
          await page.getByRole("button", { name: /^(用户菜单|User menu)$/ }).click()
          await page.getByRole("menuitem", { name: /^(退出登录|Logout)$/ }).waitFor()
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: /^(切换语言|Switch language)$/ }).click()
          await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
          await page.setViewportSize({ width: 390, height: 844 })
          await page.getByRole("button", { name: "Open navigation", exact: true }).waitFor()
          await page.screenshot({
            path: fileURLToPath(new URL(`${target}-${account}-en-theme-390.png`, screenshots)),
            fullPage: true,
          })
        } else {
          await page.setViewportSize({ width: 390, height: 844 })
          await page.screenshot({
            path: fileURLToPath(new URL(`${target}-${account}-390.png`, screenshots)),
            fullPage: true,
          })
        }
        assert.deepEqual(errors, [], `${target}: browser runtime errors`)
        assert.deepEqual(failedRequests, [], `${target}: failed network requests`)
        results.push({ target, account, status: "passed", errors, failedRequests })
      } catch (error) {
        await page
          .screenshot({ path: fileURLToPath(new URL(`${target}-${account}-failure.png`, screenshots)), fullPage: true })
          .catch(() => {})
        results.push({ target, account, status: "failed", message: String(error), errors, failedRequests })
      } finally {
        await page.close()
      }
    }
    await context.close()
  }
} finally {
  await browser.close()
  await writeFile(new URL("reviews/foundation-browser.json", output), JSON.stringify(results, null, 2) + "\n")
}
for (const result of results)
  console.log(`${result.target}/${result.account}: ${result.status}${result.message ? ` — ${result.message}` : ""}`)
if (results.some((result) => result.status !== "passed")) process.exitCode = 1
