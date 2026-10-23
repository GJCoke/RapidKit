import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/role/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
})
const results = []
async function shot(page, target, scene) {
  await page.screenshot({ path: fileURLToPath(new URL(`${target}-${scene}.png`, shots)), fullPage: true })
}
try {
  for (const account of ["admin", "guest"])
    for (const target of ["frontend", "admin"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = [],
        failures = []
      page.on("pageerror", (e) => errors.push(e.message))
      page.on("requestfailed", (r) => {
        if (r.failure()?.errorText !== "net::ERR_ABORTED") failures.push(r.failure()?.errorText)
      })
      try {
        const origin = `http://localhost:${target === "admin" ? 3100 : 9527}`
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        await page.goto(`${origin}/manage/role`)
        await page.getByRole("cell", { name: "ADMIN", exact: true }).waitFor()
        if (target === "admin") {
          await page.getByRole("combobox", { name: "角色状态", exact: true }).click()
          await page.getByRole("option", { name: "禁用", exact: true }).click()
        } else {
          await page
            .locator(".n-base-selection")
            .filter({ hasText: "请选择角色状态" })
            .locator(".n-base-selection-label")
            .click()
          await page
            .locator(".n-base-select-option")
            .filter({ hasText: /^禁用$/ })
            .click()
        }
        const filtered = page.waitForResponse((r) => /\/roles(?:\?|$)/.test(r.url()) && r.request().method() === "GET")
        await page.getByRole("button", { name: "搜索", exact: true }).click()
        await filtered
        await page
          .getByText(target === "admin" ? "暂无数据" : "无数据", { exact: true })
          .first()
          .waitFor()
        await shot(page, target, `${account}-disabled-filter`)
        const reset =
          target === "frontend"
            ? page.waitForResponse((r) => /\/roles(?:\?|$)/.test(r.url()) && r.request().method() === "GET")
            : Promise.resolve()
        await page.getByRole("button", { name: "重置", exact: true }).click()
        if (target === "frontend") await page.getByRole("button", { name: "搜索", exact: true }).click()
        await reset
        await page.getByRole("cell", { name: "ADMIN", exact: true }).waitFor()
        await page.getByRole("button", { name: "列设置", exact: true }).click()
        const description = page.getByRole("checkbox", { name: "角色描述", exact: true })
        await description.click()
        assert.equal(await page.getByRole("columnheader", { name: "角色描述", exact: true }).count(), 0)
        await description.click()
        await page.keyboard.press("Escape")
        await page.getByRole("columnheader", { name: "角色描述", exact: true }).waitFor()
        if (account === "guest") {
          assert.equal(
            await page.getByRole("button", { name: /^(新增角色|新增|编辑|删除|批量删除|权限配置)$/ }).count(),
            0,
          )
          assert.equal(await page.getByRole("columnheader", { name: "操作", exact: true }).count(), 0)
          await shot(page, target, "guest")
        } else {
          let release
          const gate = new Promise((resolve) => {
            release = resolve
          })
          let intercepted
          const started = new Promise((resolve) => {
            intercepted = resolve
          })
          const pattern = /\/roles(?:\?|$)/
          await page.route(pattern, async (route) => {
            if (route.request().method() !== "GET") return route.continue()
            intercepted()
            await gate
            return route.continue()
          })
          await page.getByRole("button", { name: "刷新", exact: true }).click()
          await started
          await shot(page, target, "loading")
          release()
          await page.unrouteAll({ behavior: "wait" })
          await page.getByRole("cell", { name: "ADMIN", exact: true }).waitFor()
          let failed = false
          await page.route(pattern, async (route) => {
            if (route.request().method() !== "GET") return route.continue()
            failed = true
            await route.fulfill({ json: { code: 500, message: "Migration failure fixture", data: null } })
          })
          const pending = page.waitForResponse((r) => pattern.test(r.url()) && r.request().method() === "GET")
          await page.getByRole("button", { name: "刷新", exact: true }).click()
          await pending
          assert(failed)
          if (target === "admin") await page.getByText("数据加载失败", { exact: true }).waitFor()
          else await page.getByText("Migration failure fixture", { exact: true }).waitFor()
          await shot(page, target, "error")
          await page.unrouteAll({ behavior: "wait" })
          await page.getByRole("button", { name: target === "admin" ? "重试" : "刷新", exact: true }).click()
          await page.getByRole("cell", { name: "ADMIN", exact: true }).waitFor()
        }
        if (target === "admin") {
          await page.getByRole("button", { name: "切换语言", exact: true }).click()
          await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
          await page.locator("html.dark").waitFor()
          await page.getByRole("heading", { name: "Role List", exact: true }).waitFor()
        } else {
          const langButton = page.getByRole("button").filter({ has: page.locator("svg.iconify--heroicons") })
          await langButton.hover()
          await page.getByText("English", { exact: true }).click()
          await page.getByText("Role List", { exact: true }).waitFor()
          await page.locator("header button").nth(4).click()
          await page.locator("html.dark").waitFor()
        }
        await shot(page, target, `${account}-en`)
        await page.setViewportSize({ width: 390, height: 844 })
        if (target === "admin")
          await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
        console.log(
          target,
          account,
          "mobile bounds",
          await page.locator("body").evaluate((body) => ({
            width: body.scrollWidth,
            viewport: innerWidth,
            scrollX,
            main: document.querySelector("main")?.getBoundingClientRect().toJSON(),
          })),
        )
        await shot(page, target, `${account}-en-390`)
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        results.push({ target, account, status: "passed", errors, failures })
      } catch (e) {
        await shot(page, target, `${account}-states-failure`)
        results.push({ target, account, status: "failed", message: String(e), errors, failures })
      } finally {
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(new URL("reviews/role-states-browser.json", output), JSON.stringify(results, null, 2) + "\n")
}
for (const result of results) console.log(result)
if (results.some((r) => r.status !== "passed")) process.exitCode = 1
