import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { deliveryFixtures, deliveryPattern, firstMessageId, secondMessageId } from "./delivery-fixtures.mjs"
const output = new URL("../../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/deliveries/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
  }),
  results = []
async function shot(page, target, scene) {
  await page.mouse.move(1, 1)
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  await page.screenshot({
    path: fileURLToPath(new URL(`${target}-${scene}.png`, shots)),
    fullPage: true,
    animations: "disabled",
    timeout: 30000,
  })
}
async function until(check) {
  const end = Date.now() + 15000
  while (!check()) {
    assert(Date.now() < end, "expected fixture request before timeout")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
const listURL = (url) => /\/(?:api\/v1|proxy-default)\/admin\/notification-deliveries(?:\?|$)/.test(url)
const summaryURL = (url) => /\/admin\/notification-deliveries\/[^/?]+\/summary(?:\?|$)/.test(url)
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          timezoneId: "Asia/Shanghai",
          permissions: ["clipboard-read", "clipboard-write"],
        }),
        page = await context.newPage(),
        admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        path = "/notification/manage/deliveries",
        fixture = deliveryFixtures(),
        checks = [],
        errors = [],
        failures = [],
        consoleErrors = []
      page.setDefaultTimeout(15000)
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      const main = page.locator("main"),
        panel = () =>
          admin
            ? page.getByRole("dialog", { name: /^(投递详情|Delivery details)$/ })
            : page.locator(".n-drawer-content:visible").last(),
        confirmation = () =>
          admin
            ? page.getByRole("alertdialog", { name: "重试失败投递", exact: true })
            : page.locator(".n-dialog:visible").last(),
        row = (name) => page.getByRole("row").filter({ hasText: name }).first()
      const checkpoint = (message) => {
        checks.push(message)
        console.log(target, account, "checkpoint", checks.length, message)
      }
      const refresh = () => main.getByRole("button", { name: "刷新", exact: true }).first().click()
      const input = () =>
        admin
          ? main.getByRole("textbox", { name: "消息 ID", exact: true })
          : main.getByPlaceholder("输入消息 ID 查询", { exact: true })
      const showManual = async () => {
        if (!(await input().isVisible())) await main.getByRole("button", { name: "高级查询", exact: true }).click()
        await input().waitFor()
      }
      const selectRecent = async (title) => {
        if (admin) {
          await main.getByRole("combobox", { name: "选择消息", exact: true }).click()
          await page.getByRole("option").filter({ hasText: title }).click()
        } else {
          await main.locator('.n-select[aria-label="选择消息"]').click()
          await page.locator(".n-base-select-option").filter({ hasText: title }).click()
        }
      }
      const closePanel = async () => {
        const current = panel()
        await current.getByRole("button", { name: "关闭", exact: true }).click()
        await current.waitFor({ state: "hidden" })
      }
      const languageTheme = async () => {
        if (admin) {
          await page.getByRole("button", { name: "切换语言", exact: true }).click()
          await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
        } else {
          await page
            .getByRole("button")
            .filter({ has: page.locator("svg.iconify--heroicons") })
            .hover()
          await page.getByText("English", { exact: true }).filter({ visible: true }).click()
          await page.locator("header button").nth(4).click()
        }
        await page.locator("html.dark").waitFor()
      }
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        if (account === "guest") {
          let reads = 0
          page.on("request", (request) => {
            if (deliveryPattern.test(request.url())) reads++
          })
          await page.goto(`${origin}${path}`)
          if (admin) await page.getByRole("alertdialog", { name: "访问权限已变更", exact: true }).waitFor()
          else await page.waitForURL((url) => url.pathname === "/403")
          assert.equal(reads, 0)
          await shot(page, target, "guest-denied")
          if (admin) {
            await page.getByRole("alertdialog").getByRole("button", { name: "确定", exact: true }).click()
            await page.waitForURL((url) => url.pathname !== path)
          }
          if (new URL(page.url()).pathname === "/403") {
            await page.getByRole("button", { name: "返回首页", exact: true }).click()
            await page.waitForURL((url) => url.pathname === "/home")
          }
          await languageTheme()
          await page.goto(`${origin}${path}`)
          if (admin) await page.getByRole("alertdialog", { name: "Access permissions changed", exact: true }).waitFor()
          else await page.waitForURL((url) => url.pathname === "/403")
          await shot(page, target, "guest-en-dark")
          await page.setViewportSize({ width: 390, height: 844 })
          await shot(page, target, "guest-en-dark-390")
          assert.equal(reads, 0)
          checkpoint("genuine guest denied without delivery or announcement reads, English/dark/390px")
        } else {
          const realRecent = page
              .waitForResponse(
                (response) =>
                  /\/admin\/notifications(?:\?|$)/.test(response.url()) && response.request().method() === "GET",
              )
              .then((response) => response.json()),
            realRows = page
              .waitForResponse((response) => listURL(response.url()) && response.request().method() === "GET")
              .then((response) => response.json()),
            realSummary = page
              .waitForResponse((response) => summaryURL(response.url()))
              .then((response) => response.json())
          await page.goto(`${origin}${path}`)
          const recent = await realRecent
          assert.equal(recent.code, 0)
          if (!recent.data.records.length) {
            await showManual()
            await input().fill(firstMessageId)
            await main.getByRole("button", { name: "搜索", exact: true }).click()
          }
          assert.equal((await realRows).code, 0)
          assert.equal((await realSummary).code, 0)
          checkpoint("genuine administrator login and authorized real recent/summary/list reads")
          await page.route(deliveryPattern, fixture.handler)
          await refresh()
          await until(() => fixture.recent.length > 0)
          await selectRecent("Parity notice")
          await row("Failed reader").waitFor()
          await shot(page, target, "list")
          assert.equal(fixture.recent.at(-1).displayMode, "inbox")
          assert.equal(fixture.recent.at(-1).pageSize, "20")
          assert(!(await main.innerText()).includes("Removed secret name"))
          assert(!(await main.innerText()).includes("Secret department"))
          await main.getByText("用户已删除", { exact: true }).waitFor()
          await main.getByText("接收人资料不可用", { exact: true }).waitFor()
          checkpoint("latest message selection, six states and deleted/unavailable/disabled/pending recipients")
          await showManual()
          const readsBefore = fixture.lists.length
          await input().fill("bad")
          await main.getByText("请输入有效的 UUID 消息 ID", { exact: true }).waitFor()
          assert(await main.getByRole("button", { name: "搜索", exact: true }).isDisabled())
          assert.equal(fixture.lists.length, readsBefore)
          await input().fill(` ${firstMessageId.toUpperCase()} `)
          await main.getByRole("button", { name: "搜索", exact: true }).click()
          await row("Failed reader").waitFor()
          assert.equal(fixture.lists.at(-1).messageId, firstMessageId)
          checkpoint("invalid UUID never queries; valid UUID trims and normalizes")
          const summary = page.locator(admin ? 'section[aria-label="投递汇总"]' : '[aria-label="投递汇总"]')
          await summary.getByRole("button").filter({ hasText: "失败" }).click()
          await row("Sent reader").waitFor({ state: "hidden" })
          assert.equal(fixture.lists.at(-1).status, "dead")
          await main.getByRole("button", { name: "清除筛选", exact: true }).click()
          await row("Sent reader").waitFor()
          assert.equal(fixture.lists.at(-1).status, undefined)
          checkpoint("summary cards filter state and clear back to all records")
          const outcomes = [
            ["Sent reader", "投递完成"],
            ["Pending reader", "等待投递"],
            ["Processing reader", "正在投递"],
            ["Retrying reader", "等待自动重试"],
            ["Cancelled reader", "投递已取消"],
          ]
          for (const [name, title] of outcomes) {
            await row(name).getByRole("button", { name: "详情", exact: true }).click()
            await panel().getByRole("heading", { name: title, exact: true }).waitFor()
            await panel().getByText("技术信息", { exact: true }).click()
            if (name === "Processing reader") await panel().getByText("锁定截止", { exact: true }).waitFor()
            if (name === "Sent reader")
              await panel()
                .getByText("投递完成表示发送流程已执行完成，不代表用户在线接收或已经阅读。", { exact: true })
                .waitFor()
            await closePanel()
          }
          await row("Failed reader").getByRole("button", { name: "详情", exact: true }).click()
          await panel().getByRole("heading", { name: "投递失败", exact: true }).waitFor()
          await panel().getByText("技术信息", { exact: true }).click()
          await panel().getByText("inapp_emit_failed", { exact: true }).waitFor()
          await panel().getByRole("button", { name: "复制投递 ID", exact: true }).click()
          assert.equal(
            await page.evaluate(() => navigator.clipboard.readText()),
            fixture.rows.find((row) => row.recipient?.name === "Failed reader").id,
          )
          await page.evaluate(() => {
            window.__deliveryClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard)
            navigator.clipboard.writeText = () => Promise.reject(new Error("Fixture clipboard denied"))
          })
          await panel().getByRole("button", { name: "复制消息 ID", exact: true }).click()
          await page.getByText("复制失败，请手动选择并复制", { exact: true }).first().waitFor()
          await page.evaluate(() => {
            navigator.clipboard.writeText = window.__deliveryClipboardWrite
            delete window.__deliveryClipboardWrite
          })
          await shot(page, target, "detail-technical")
          await panel().getByRole("button", { name: "查看消息", exact: true }).click()
          const announcement = admin
            ? page.getByRole("dialog", { name: "公告详情", exact: true })
            : page
                .locator(".n-drawer-content:visible")
                .filter({ has: page.getByText("公告详情", { exact: true }) })
                .last()
          await announcement.getByText("Parity message body", { exact: true }).waitFor()
          await shot(page, target, "message-detail")
          await page.keyboard.press("Escape")
          await announcement.waitFor({ state: "hidden" })
          await panel().getByRole("button", { name: "返回工作台", exact: true }).click()
          await panel().waitFor({ state: "hidden" })
          await main.getByRole("button", { name: "清除筛选", exact: true }).waitFor()
          assert.equal(fixture.lists.at(-1).status, "dead")
          await main.getByRole("button", { name: "清除筛选", exact: true }).click()
          await row("Sent reader").waitFor()
          checkpoint(
            "all six outcome details, technical fields/copy success+failure, related message and dead-record workbench return",
          )
          fixture.failRetry = true
          await main.getByRole("button", { name: "重试失败 2 条", exact: true }).click()
          await confirmation().waitFor()
          assert((await confirmation().innerText()).includes("2"))
          assert.equal(fixture.retries.length, 0)
          const failedRetry = page.waitForResponse((response) => response.url().includes("/retry-failed"))
          await confirmation().getByRole("button", { name: "确认重试", exact: true }).click()
          await failedRetry
          assert(await confirmation().isVisible())
          if (admin) await confirmation().getByText("重试失败，请稍后重试。", { exact: true }).waitFor()
          fixture.failRetry = false
          let releaseRetry
          fixture.retryGate = new Promise((resolve) => (releaseRetry = resolve))
          await confirmation().getByRole("button", { name: "确认重试", exact: true }).click()
          await until(() => fixture.retries.length === 2)
          if (admin) assert(await confirmation().getByRole("button", { name: "加载中...", exact: true }).isDisabled())
          else {
            await confirmation().getByRole("button", { name: "确认重试", exact: true }).click()
            assert.equal(fixture.retries.length, 2, "pending source confirmation cannot submit another retry")
          }
          assert(await confirmation().getByRole("button", { name: "取消", exact: true }).isEnabled())
          await confirmation().getByRole("button", { name: "取消", exact: true }).click()
          await confirmation().waitFor({ state: "hidden" })
          fixture.retryGate = null
          releaseRetry()
          await confirmation().waitFor({ state: "hidden" })
          await main.getByRole("button", { name: "重试失败 0 条", exact: true }).waitFor()
          assert(await main.getByRole("button", { name: "重试失败 0 条", exact: true }).isDisabled())
          assert.deepEqual(
            fixture.retries.map((retry) => retry.id),
            [firstMessageId, firstMessageId],
          )
          checkpoint(
            "failed retry preserves confirmation, pending dismissal keeps the request single-flight and refreshes counts",
          )
          await selectRecent("Parity recalled")
          await main.getByText("Parity recalled", { exact: true }).first().waitFor()
          await page.getByText("暂未查询到投递数据", { exact: true }).waitFor()
          assert(await main.getByRole("button", { name: "重试失败 0 条", exact: true }).isDisabled())
          await selectRecent("Parity notice")
          await row("Sent reader").waitFor()
          checkpoint("message switching resets filters/details and retry respects message lifecycle")
          const seed = structuredClone(fixture.rows[0])
          for (let index = 0; index < 21; index++)
            fixture.rows.push({
              ...structuredClone(seed),
              id: `dddddddd-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              recipient: { ...seed.recipient, name: `Padding reader ${index}` },
            })
          await refresh()
          await row("Padding reader 0").waitFor()
          await (
            admin
              ? main.getByRole("button", { name: "下一页", exact: true })
              : main.locator(".n-pagination-item--button").last()
          ).click()
          await row("Padding reader 20").waitFor()
          assert.equal(fixture.lists.at(-1).page, "2")
          await (
            admin
              ? main.getByRole("button", { name: "上一页", exact: true })
              : main.locator(".n-pagination-item--button").first()
          ).click()
          await row("Sent reader").waitFor()
          checkpoint("pagination and page size twenty preserve message scope")
          fixture.emptyRecords = true
          await refresh()
          await page.getByText("暂未查询到投递数据", { exact: true }).waitFor()
          await shot(page, target, "empty")
          fixture.emptyRecords = false
          await refresh()
          await row("Sent reader").waitFor()
          let release
          fixture.readGate = new Promise((resolve) => (release = resolve))
          const before = fixture.lists.length
          await refresh()
          await until(() => fixture.lists.length > before)
          await shot(page, target, "loading")
          const completed = page.waitForResponse((response) => listURL(response.url()))
          fixture.readGate = null
          release()
          await completed
          await row("Sent reader").waitFor()
          fixture.failSummary = true
          await refresh()
          await (admin?main.getByText("投递汇总加载失败，请刷新重试。",{exact:true}):main.locator(".n-alert").filter({hasText:"投递汇总加载失败，请刷新重试。"})).waitFor()
          assert(await main.getByRole("button", { name: "重试失败 0 条", exact: true }).isDisabled())
          await shot(page, target, "summary-failure")
          fixture.failSummary = false
          await refresh()
          await row("Sent reader").waitFor()
          fixture.failList = true
          await refresh()
          await (admin?main.getByText("投递明细加载失败，请刷新重试。",{exact:true}):main.locator(".n-alert").filter({hasText:"投递明细加载失败，请刷新重试。"})).waitFor()
          await shot(page, target, "list-failure")
          fixture.failList = false
          await refresh()
          await row("Sent reader").waitFor()
          fixture.failRecent = true
          await refresh()
          await main.getByText("最近消息加载失败，可刷新重试，或使用消息 ID 定位。", { exact: true }).waitFor()
          await shot(page, target, "recent-failure")
          fixture.failRecent = false
          await refresh()
          await row("Sent reader").waitFor()
          checkpoint("empty/loading and independent recent, summary and rows failures recover without stale counts")
          await languageTheme()
          await main.getByRole("heading", { name: "Deliveries", exact: true }).waitFor()
          await shot(page, target, "admin-en-dark")
          await page.setViewportSize({ width: 390, height: 844 })
          if (!admin) {
            const bounds = await main.boundingBox()
            if (bounds && bounds.x > 100) await page.locator("header button").first().click()
          }
          if (admin)
            await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
          await shot(page, target, "admin-en-dark-390")
          if(admin){const bounds=await main.getByRole("combobox",{name:"Select message",exact:true}).evaluate(element=>({button:element.getBoundingClientRect().right,card:element.closest("section").getBoundingClientRect().right}));assert(bounds.button<=bounds.card+1,"message picker fits its card at390px")}

          if (admin) assert(await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth + 1))
          await row("Sent reader").getByRole("button", { name: "Details", exact: true }).click()
          await panel().getByRole("heading", { name: "Delivery completed", exact: true }).waitFor()
          await shot(page, target, "detail-en-dark-390")
          if (admin) assert(await panel().evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          await (admin ? panel().locator('[data-slot="sheet-footer"]') : panel().locator(".n-drawer-footer"))
            .getByRole("button", { name: "Close", exact: true })
            .click()
          checkpoint("English/dark and 390px workbench/detail have no horizontal page overflow")
        }
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        assert.deepEqual(consoleErrors, [])
        results.push({ target, account, status: "passed", checks, errors, failures, consoleErrors })
        console.log(target, account, "passed")
      } catch (error) {
        await shot(page, target, "failure")
        results.push({
          target,
          account,
          status: "failed",
          message: String(error),
          checks,
          errors,
          failures,
          consoleErrors,
        })
        console.log(target, account, String(error), checks, errors, failures, consoleErrors)
      } finally {
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(
    new URL("reviews/deliveries-browser-development.json", output),
    JSON.stringify(results, null, 2) + "\n",
  )
}
if (results.some((result) => result.status === "failed")) process.exitCode = 1
