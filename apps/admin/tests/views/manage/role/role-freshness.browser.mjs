import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/role/review-5/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true })
const results = []
async function until(check) {
  const deadline = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < deadline, "role request condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
try {
  for (const account of ["admin", "guest"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const errors = [],
      consoleErrors = [],
      failures = [],
      writes = [],
      reads = []
    let holdCached = false
    let closing = false,
      release,
      started = false
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("requestfailed", (request) => {
      if (!closing && request.failure()?.errorText !== "net::ERR_ABORTED") failures.push(request.failure()?.errorText)
    })
    page.on("request", (request) => {
      if (
        /\/api\/v1\//.test(request.url()) &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        !/\/auth\/(?:login|refresh)(?:\?|$)/.test(request.url())
      )
        writes.push({ url: request.url(), method: request.method() })
    })
    try {
      await page.goto("http://localhost:3100/login")
      await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
      await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
      await page.getByRole("button", { name: "登录", exact: true }).click()
      await page.waitForURL((url) => url.pathname === "/home")
      const real = page.waitForResponse((response) => /\/api\/v1\/roles(?:\?|$)/.test(response.url()))
      await page.goto("http://localhost:3100/manage/role")
      const body = await (await real).json()
      assert.equal(body.code, 0)
      assert(body.data.records.length > 0)
      let name = "Parity Reader"
      await page.route(/\/api\/v1\/roles(?:\?|$)/, async (route) => {
        assert.equal(route.request().method(), "GET")
        const keyword = new URL(route.request().url()).searchParams.get("keyword") || ""
        reads.push(keyword)
        if (keyword === "pending" || (keyword === "" && holdCached)) {
          started = true
          await new Promise((resolve) => {
            release = resolve
          })
        }
        if (closing) return
        await route.fulfill({
          json: {
            code: 0,
            data: {
              records: keyword === "pending" ? [] : [{ ...body.data.records[0], name, code: "PARITY_READER" }],
              page: 1,
              pageSize: 10,
              total: keyword === "pending" ? 0 : 1,
            },
          },
        })
      })
      await page.reload()
      const main = page.locator("main")
      await main.getByRole("cell", { name, exact: true }).waitFor()
      name = "Remote One"
      await main.getByRole("button", { name: "搜索", exact: true }).click()
      await main.getByRole("cell", { name, exact: true }).waitFor()
      assert.deepEqual(reads, ["", ""])
      await main.locator("#role-keyword").fill("other")
      await main.getByRole("button", { name: "搜索", exact: true }).click()
      await until(() => reads.length === 3)
      await main.getByRole("cell", { name, exact: true }).waitFor()
      name = "Remote Two"
      await main.getByRole("button", { name: "重置", exact: true }).click()
      await main.getByRole("cell", { name, exact: true }).waitFor()
      assert.deepEqual(reads, ["", "", "other", ""])
      await main.locator("#role-keyword").fill("pending")
      await main.getByRole("button", { name: "搜索", exact: true }).click()
      await until(() => started)
      await main.getByRole("cell", { name, exact: true }).waitFor({ state: "hidden" })
      assert.equal(await main.getByRole("button", { name: "编辑", exact: true }).count(), 0)
      assert.equal(await main.getByRole("button", { name: "权限配置", exact: true }).count(), 0)
      if (account === "admin") assert(await main.getByRole("button", { name: "批量删除", exact: true }).isDisabled())
      await page.screenshot({
        path: fileURLToPath(new URL(`admin-${account}-pending-filter.png`, shots)),
        fullPage: true,
      })
      release()
      await main.getByText("暂无数据", { exact: true }).waitFor()
      assert.deepEqual(reads, ["", "", "other", "", "pending"])
      started = false
      holdCached = true
      name = "Fresh Cached Reader"
      await main.getByRole("button", { name: "重置", exact: true }).click()
      await until(() => started)
      await main.getByRole("cell", { name: "Remote Two", exact: true }).waitFor({ state: "hidden" })
      assert.equal(await main.getByRole("button", { name: "编辑", exact: true }).count(), 0)
      assert.equal(await main.getByRole("button", { name: "权限配置", exact: true }).count(), 0)
      await page.screenshot({
        path: fileURLToPath(new URL(`admin-${account}-cached-filter.png`, shots)),
        fullPage: true,
      })
      release()
      await main.getByRole("cell", { name, exact: true }).waitFor()
      assert.deepEqual(reads, ["", "", "other", "", "pending", ""])
      assert.deepEqual(errors, [])
      assert.deepEqual(consoleErrors, [])
      assert.deepEqual(failures, [])
      assert.deepEqual(writes, [])
      results.push({ account, reads, errors, consoleErrors, failures, writes })
      console.log(account, "fresh explicit/cached search and pending-filter isolation passed")
    } catch (error) {
      results.push({ account, error: String(error), reads, errors, consoleErrors, failures, writes })
      console.error(account, error)
    } finally {
      closing = true
      release?.()
      await context.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(new URL("role-review-5-freshness-browser.json", output), JSON.stringify(results, null, 2) + "\n")
}
assert(results.every((result) => !result.error))
