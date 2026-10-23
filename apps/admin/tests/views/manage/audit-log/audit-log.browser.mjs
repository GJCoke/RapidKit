import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/audit-log/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
  }),
  results = []
const pattern = /\/system\/audit-logs\/paginate(?:\?|$)/
async function shot(page, target, scene) {
  const toasts = page.locator(target === "admin" ? "[data-sonner-toast]" : ".n-message")
  if (await toasts.count()) await toasts.last().waitFor({ state: "hidden" })
  await page.mouse.move(0, 0)
  if (scene.includes("-en"))
    await page
      .locator(
        target === "admin"
          ? '[data-layout-scroll-owner], [data-layout-scroll-owner] [data-slot="scroll-area-viewport"]'
          : "main",
      )
      .evaluateAll((nodes) =>
        nodes.forEach((node) => {
          node.scrollTop = 0
        }),
      )
  await page.screenshot({ path: fileURLToPath(new URL(`${target}-${scene}.png`, shots)), fullPage: true })
}
try {
  for (const account of ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
        page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = [],
        failures = []
      page.on("pageerror", (e) => errors.push(e.message))
      page.on("requestfailed", (r) => {
        if (r.failure()?.errorText !== "net::ERR_ABORTED") failures.push(r.failure()?.errorText)
      })
      try {
        const origin = `http://localhost:${target === "admin" ? 3100 : 9527}`,
          url = `${origin}/manage/audit-log?timeRange=all&resourceType=menu`
        await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin })
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((u) => !u.pathname.startsWith("/login"))
        let response = page.waitForResponse((r) => pattern.test(r.url()))
        await page.goto(url)
        let data = (await (await response).json()).data
        assert(data.records.length > 0, "real menu audit records should be available from the CRUD comparison")
        await page.getByRole("button", { name: "详情", exact: true }).first().waitFor()
        await shot(page, target, `${account}-list`)
        await page.getByRole("button", { name: "列设置", exact: true }).click()
        const ipLabel = target === "admin" ? "IP 地址" : "IP"
        const ip = page.getByRole("checkbox", { name: ipLabel, exact: true })
        await ip.click()
        await page.getByRole("columnheader", { name: ipLabel, exact: true }).first().waitFor()
        await ip.click()
        await page.keyboard.press("Escape")
        for (const [label, hours] of [
          ["最近24小时", 24],
          ["今天", null],
          ["最近7天", 168],
        ]) {
          const pending = page.waitForResponse((r) => pattern.test(r.url()))
          await page.getByRole("button", { name: label, exact: true }).click()
          const response = await pending,
            params = new URL(response.url()).searchParams
          assert(params.get("startTime") && params.get("endTime"))
          if (hours)
            assert.equal(Date.parse(params.get("endTime")) - Date.parse(params.get("startTime")), hours * 3600000)
          else
            assert.equal(
              new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" }).format(
                new Date(params.get("startTime")),
              ),
              "00",
            )
        }
        if (target === "admin") {
          await page.locator("#audit-startTime").fill("")
          await page.locator("#audit-endTime").fill("")
          await page.getByRole("button", { name: "搜索", exact: true }).click()
          await page.waitForURL((u) => u.searchParams.get("timeRange") === "all")
          await page.locator('section[aria-label="已应用条件"]').getByText("全部时间", { exact: true }).waitFor()
          const cleared = page.waitForResponse((r) => {
            const params = new URL(r.url()).searchParams
            return pattern.test(r.url()) && !params.has("startTime") && !params.has("endTime")
          })
          await page.getByRole("button", { name: "刷新", exact: true }).click()
          const params = new URL((await cleared).url()).searchParams
          assert(!params.has("startTime") && !params.has("endTime"), "cleared custom times must search all history")
        }
        await page.getByRole("button", { name: "全部时间", exact: true }).click()
        await page.waitForURL((u) => u.searchParams.get("timeRange") === "all" && !u.searchParams.has("startTime"))
        for (const label of ["失败与未确认", "全部记录"]) {
          const pending = page.waitForResponse((r) => pattern.test(r.url()))
          await page.getByRole(target === "admin" ? "tab" : "button", { name: label, exact: true }).click()
          await pending
          assert.equal(new URL(page.url()).searchParams.get("view"), label === "全部记录" ? "all" : "attention")
        }

        await page.getByRole("button", { name: "记录范围与说明", exact: true }).click()
        await page.getByText("没有记录，代表没有发生吗？", { exact: true }).waitFor()
        await shot(page, target, `${account}-help`)
        await page.keyboard.press("Escape")
        await page
          .getByRole("textbox", { name: "人员或对象名称", exact: true })
          .fill(`migration_no_match_${Date.now()}`)
        response = page.waitForResponse((r) => pattern.test(r.url()))
        await page.getByRole("button", { name: "搜索", exact: true }).click()
        await response
        await page.getByText("当前时间范围和筛选条件下没有记录", { exact: true }).waitFor()
        await shot(page, target, `${account}-empty`)
        await page.getByRole("button", { name: "清空筛选并查看全部时间", exact: true }).click()
        await page.getByRole("button", { name: "详情", exact: true }).first().waitFor()
        assert.equal(new URL(page.url()).searchParams.get("timeRange"), "all")
        response = page.waitForResponse((r) => pattern.test(r.url()))
        await page.goto(url)
        data = (await (await response).json()).data
        const single = data.records.findIndex((row) => row.resourceId)
        assert(single >= 0, "single-resource menu audit record expected")
        await page.getByRole("button", { name: "详情", exact: true }).nth(single).click()
        const dialog = () =>
          target === "admin"
            ? page.getByRole("dialog", { name: "审计详情", exact: true })
            : page.locator(".n-drawer").last()
        await dialog().getByText("变更内容", { exact: true }).waitFor()
        assert(new URL(page.url()).searchParams.get("auditId"))
        await dialog().getByText("技术信息 · 提供给技术人员排查", { exact: true }).click()
        await dialog().getByText("请求摘要 · 仅保留安全字段", { exact: true }).waitFor()
        await shot(page, target, `${account}-detail-technical`)
        await dialog().getByRole("button", { name: "复制", exact: true }).first().click()
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), data.records[single].id)
        await page.getByText("已复制", { exact: true }).first().waitFor()
        const relatedResponse = page.waitForResponse(
          (r) => pattern.test(r.url()) && new URL(r.url()).searchParams.has("resourceId"),
        )
        await dialog().getByRole("button", { name: "查看对象历史", exact: true }).click()
        const related = (await (await relatedResponse).json()).data
        await dialog().getByRole("button", { name: "查看此事件", exact: true }).first().waitFor()
        const other = related.records.findIndex((row) => row.id !== data.records[single].id)
        assert(other >= 0, "created and deleted fixture must have multiple resource history events")
        await shot(page, target, `${account}-related`)
        await dialog().getByRole("button", { name: "查看此事件", exact: true }).nth(other).click()
        await dialog().getByRole("button", { name: "返回上一条事件", exact: true }).waitFor()
        await dialog().getByRole("button", { name: "返回上一条事件", exact: true }).click()
        await dialog().getByText("变更内容", { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get("resourceType"), "menu")
        await page.keyboard.press("Escape")
        await dialog().waitFor({ state: "hidden" })
        const batch = data.records.findIndex((row) => row.targetCount)
        assert(batch >= 0, "batch menu audit record expected")
        await page.getByRole("button", { name: "详情", exact: true }).nth(batch).click()
        await dialog().getByText("批量操作对象", { exact: true }).waitFor()
        await shot(page, target, `${account}-batch-targets`)
        await page.keyboard.press("Escape")
        await dialog().waitFor({ state: "hidden" })
        await page.goBack()
        await page.waitForURL((u) => !u.searchParams.has("resourceType"))
        await page.goForward()
        await page.waitForURL((u) => u.searchParams.get("resourceType") === "menu")
        if (account === "admin") {
          let release, started
          const gate = new Promise((resolve) => {
              release = resolve
            }),
            pending = new Promise((resolve) => {
              started = resolve
            })
          await page.route(pattern, async (route) => {
            started()
            await gate
            await route.continue()
          })
          await page.getByRole("button", { name: "刷新", exact: true }).click()
          await pending
          const complete = page.waitForResponse((r) => pattern.test(r.url()))
          await shot(page, target, "loading")
          release()
          await complete
          await page.unrouteAll({ behavior: "wait" })
          await page.route(pattern, (route) =>
            route.fulfill({ json: { code: 500, message: "Audit migration failure fixture", data: null } }),
          )
          response = page.waitForResponse((r) => pattern.test(r.url()))
          await page.getByRole("button", { name: "刷新", exact: true }).click()
          await response
          if (target === "admin") await page.getByText("数据加载失败", { exact: true }).waitFor()
          else await page.locator(".n-alert").filter({ hasText: "加载失败，请重试。" }).waitFor()
          await shot(page, target, "error")
          await page.unrouteAll({ behavior: "wait" })
          await page
            .getByRole("button", { name: target === "admin" ? "重试" : "刷新", exact: true })
            .last()
            .click()
          await page.getByRole("button", { name: "详情", exact: true }).first().waitFor()
        }
        if (target === "admin") {
          await page.getByRole("button", { name: "切换语言", exact: true }).click()
          await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
          await page.locator("html.dark").waitFor()
          await page.getByRole("heading", { name: "Audit Log", exact: true }).waitFor()
        } else {
          await page
            .getByRole("button")
            .filter({ has: page.locator("svg.iconify--heroicons") })
            .hover()
          await page.getByText("English", { exact: true }).click()
          await page.getByText("Audit Log", { exact: true }).first().waitFor()
          await page.locator("header button").nth(4).click()
          await page.locator("html.dark").waitFor()
        }
        await shot(page, target, `${account}-en-dark`)
        await page.setViewportSize({ width: 390, height: 844 })
        if (target === "admin")
          await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
        await shot(page, target, `${account}-en-dark-390`)
        if (target === "admin") {
          assert.equal(await page.locator("body").evaluate((node) => node.scrollWidth), 390)
          const tabs = await page.getByRole("tablist").evaluate((list) => ({
            bottom: list.getBoundingClientRect().bottom,
            tabBottom: Math.max(
              ...[...list.querySelectorAll('[role="tab"]')].map((tab) => tab.getBoundingClientRect().bottom),
            ),
          }))
          assert(tabs.bottom >= tabs.tabBottom, "wrapped purpose tabs stay inside their container")
        }
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        results.push({ target, account, status: "passed", errors, failures })
      } catch (error) {
        await shot(page, target, `${account}-failure`)
        results.push({ target, account, status: "failed", message: String(error), errors, failures })
      } finally {
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(new URL("reviews/audit-log-browser.json", output), JSON.stringify(results, null, 2) + "\n")
}
for (const result of results) console.log(result)
if (results.some((result) => result.status !== "passed")) process.exitCode = 1
