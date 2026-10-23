import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/notification-center/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
})
const results = []
const listPattern = /\/notifications(?:\?|$)/
async function until(check) {
  const end = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < end, "expected protocol condition before timeout")
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
async function shot(page, target, account, scene) {
  await page.mouse.move(0, 0)
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => {})),
    )
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await page.screenshot({ path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)), fullPage: true })
}
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
        page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = [],
        failures = [],
        calls = [],
        sockets = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push(request.failure()?.errorText)
      })
      await page.routeWebSocket(/\/socket\.io\//, (socket) => {
        const server = socket.connectToServer()
        server.onMessage((data) => {
          if (String(data).startsWith("40/notifications,")) sockets.push(socket)
          socket.send(data)
        })
      })
      let release = () => {}
      try {
        const origin = `http://localhost:${target === "admin" ? 3100 : 9527}`
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        const real = page
          .waitForRequest(
            (request) =>
              listPattern.test(request.url()) && new URL(request.frame().url()).pathname === "/notification/center",
          )
          .then(async (request) => {
            const response = await request.response()
            assert(response, "the current inbox request receives a response")
            return response.json()
          })
        await page.goto(`${origin}/notification/center`)
        assert.equal((await real).code, 0, "real authenticated inbox read succeeds before fixtures")
        console.log(target, account, "real inbox verified")
        const make = (id, title, extra = {}) => ({
          id,
          messageId: `message-${id}`,
          title,
          content: `${title} complete body with multiple lines.\n${"Full notification content. ".repeat(20)}`,
          contentMode: "raw",
          level: "warning",
          category: "admin.announcement",
          mandatory: true,
          status: "published",
          createTime: "2026-10-23T08:00:00Z",
          ...extra,
        })
        let items = [
          make("one", "Migration Notice One"),
          make("archive", "Migration Archive"),
          make("delete", "Migration Delete"),
          make("jump", "Migration Action", { action: { route: "home" } }),
        ]
        let bannerRevision = 1,
          bannerVisible = true,
          failList = false,
          loading = false,
          countOverride = null
        let gate = Promise.resolve()
        const unread = () => countOverride ?? items.filter((item) => !item.readAt && item.status !== "recalled").length
        await page.route(/\/(?:api\/v1|proxy-default)\/notifications(?:\/|\?|$)/, async (route) => {
          const request = route.request(),
            url = new URL(request.url()),
            endpoint = url.pathname.slice(url.pathname.indexOf("/notifications")),
            method = request.method()
          calls.push({ endpoint, method, params: Object.fromEntries(url.searchParams) })
          let data = {}
          if (endpoint === "/notifications" && method === "GET") {
            if (loading) await gate
            if (failList)
              return route.fulfill({ json: { code: 500, message: "Notification fixture failure", data: null } })
            let filtered = items.filter(
              (item) =>
                url.searchParams.get("archived") === "all" ||
                (url.searchParams.get("archived") === "archived" ? item.archivedAt : !item.archivedAt),
            )
            if (url.searchParams.has("unreadOnly"))
              filtered = filtered.filter((item) => !item.readAt && item.status !== "recalled")
            for (const key of ["category", "level"])
              if (url.searchParams.get(key))
                filtered = filtered.filter((item) => item[key] === url.searchParams.get(key))
            if (url.searchParams.get("createdFrom"))
              filtered = filtered.filter(
                (item) => Date.parse(item.createTime) >= Date.parse(url.searchParams.get("createdFrom")),
              )
            if (url.searchParams.get("createdTo"))
              filtered = filtered.filter(
                (item) => Date.parse(item.createTime) <= Date.parse(url.searchParams.get("createdTo")),
              )
            const next = url.searchParams.has("cursor")
            data = {
              items: next ? [filtered[0], ...filtered.slice(3)].filter(Boolean) : filtered.slice(0, 3),
              nextCursor: !next && filtered.length > 3 ? "page-two" : null,
              size: 20,
            }
          } else if (endpoint === "/notifications/unread-count") data = { count: unread() }
          else if (endpoint === "/notifications/top-banner")
            data = {
              revision: bannerRevision,
              serverNow: new Date().toISOString(),
              current: bannerVisible
                ? {
                    id: "banner",
                    title: "Migration banner",
                    content: "Migration banner full body",
                    contentMode: "raw",
                    level: "warning",
                    status: "published",
                  }
                : null,
            }
          else if (endpoint === "/notifications/read-all")
            items = items.map((item) => ({ ...item, readAt: new Date().toISOString() }))
          else {
            const [, , id, operation] = endpoint.split("/")
            if (operation === "read")
              items = items.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item))
            else if (operation === "archive")
              items = items.map((item) => (item.id === id ? { ...item, archivedAt: new Date().toISOString() } : item))
            else if (method === "DELETE") items = items.filter((item) => item.id !== id)
          }
          await route.fulfill({ json: { code: 0, data } })
        })
        await page.reload()
        const main = page.locator("main")
        const card = (title) => main.getByRole(target === "admin" ? "article" : "button", { name: title, exact: true })
        await card("Migration Notice One").waitFor()
        await shot(page, target, account, "list")
        await page.getByRole("button", { name: "查看详情", exact: true }).click()
        const bannerDialog = target === "admin" ? page.getByRole("dialog") : page.locator(".n-modal")
        await bannerDialog.getByText("Migration banner full body", { exact: true }).waitFor()
        await shot(page, target, account, "banner-details")
        await page.keyboard.press("Escape")
        await bannerDialog.waitFor({ state: "hidden" })
        await main.getByRole("button", { name: "加载更多", exact: true }).click()
        await card("Migration Action").waitFor()
        assert.equal(await card("Migration Notice One").count(), 1, "cursor overlap is deduplicated")
        await main.getByRole("checkbox", { name: "只看未读", exact: true }).click()
        if (target === "admin") {
          await main.getByLabel("归档状态", { exact: true }).selectOption("all")
          await main.getByLabel("级别", { exact: true }).selectOption("warning")
          for (const [label, value] of [
            ["分类", "admin.announcement"],
            ["开始时间", "2026-10-01"],
            ["结束时间", "2026-10-24"],
          ]) {
            await main.getByLabel(label, { exact: true }).fill(value)
            await page.keyboard.press("Tab")
          }
        } else {
          await main.getByText("未归档", { exact: true }).click()
          await page.getByText("全部归档状态", { exact: true }).last().click()
          await main.locator(".n-base-selection").nth(1).click()
          await page.locator(".n-base-select-option").filter({ hasText: "警告" }).click()
          for (const [label, value] of [
            ["分类", "admin.announcement"],
            ["开始时间", "2026-10-01"],
            ["结束时间", "2026-10-24"],
          ]) {
            await main.getByPlaceholder(label, { exact: true }).fill(value)
            await page.keyboard.press("Tab")
          }
        }
        await until(() =>
          calls.some(
            (call) =>
              call.endpoint === "/notifications" &&
              call.params.unreadOnly === "true" &&
              call.params.archived === "all" &&
              call.params.level === "warning" &&
              call.params.category === "admin.announcement" &&
              call.params.createdFrom === "2026-10-01" &&
              call.params.createdTo === "2026-10-24",
          ),
        )
        await page.reload()
        await card("Migration Archive").waitFor()
        await card("Migration Archive").getByRole("button", { name: "归档", exact: true }).click()
        await card("Migration Archive").waitFor({ state: "hidden" })
        await card("Migration Delete").getByRole("button", { name: "删除", exact: true }).click()
        assert(!calls.some((call) => call.method === "DELETE"), "delete requires confirmation")
        await page.getByRole("button", { name: "确认", exact: true }).last().click()
        await card("Migration Delete").waitFor({ state: "hidden" })
        await page.getByRole("button", { name: "Migration Notice One", exact: true }).click()
        await until(() => calls.some((call) => call.endpoint === "/notifications/one/read"))
        await page.reload()
        await page.getByRole("button", { name: "Migration Action", exact: true }).click()
        await page.waitForURL((url) => url.pathname === "/home")
        await page.goto(`${origin}/notification/center`)
        await card("Migration Notice One").waitFor()
        await until(() => sockets.length > 0)
        const emit = (event, value) => sockets.at(-1).send(`42/notifications,${JSON.stringify([event, value])}`)
        countOverride = 120
        emit("notification:unread-count", { count: 120 })
        await page.getByRole("button", { name: "消息通知", exact: true }).click()
        const popover = page.getByRole("dialog", { name: "消息", exact: true })
        await popover.getByRole("button", { name: "Migration Notice One", exact: true }).waitFor()
        await popover
          .getByText("120 条未读", { exact: true })
          .or(popover.getByText("99+ 条未读", { exact: true }))
          .waitFor()
        const expand = popover.getByRole("button", { name: "展开全文", exact: true }).first()
        await expand.click()
        await popover.getByRole("button", { name: "收起全文", exact: true }).first().waitFor()
        await shot(page, target, account, "popover-expanded")
        await popover.getByRole("button", { name: "收起全文", exact: true }).first().click()
        await popover.getByRole("button", { name: "展开全文", exact: true }).first().waitFor()
        if (target === "admin") await popover.getByRole("tab", { name: "公告", exact: true }).click()
        else await popover.locator('.n-tabs-tab[data-name="announcement"]').click()
        await popover.getByRole("button", { name: "Migration Notice One", exact: true }).waitFor()
        const listBusy = popover.locator(target === "admin" ? "div[aria-busy]" : ".notification-list")
        await until(async () => (await listBusy.getAttribute("aria-busy")) === "false")
        const live = make("live", "Migration Live Message")
        items.unshift(live)
        emit("notification:new", live)
        await popover.getByRole("button", { name: "Migration Live Message", exact: true }).waitFor()
        items = items.map((item) =>
          item.messageId === live.messageId
            ? { ...item, status: "recalled", title: "", content: "", action: null }
            : item,
        )
        emit("notification:recalled", { messageId: live.messageId })
        await popover.getByText("该消息已被撤回", { exact: true }).waitFor()
        assert.equal(await popover.getByText("Migration Live Message", { exact: true }).count(), 0)
        await shot(page, target, account, "recalled")
        countOverride = null
        await popover.getByRole("button", { name: "全部已读", exact: true }).click()
        await until(() => calls.some((call) => call.endpoint === "/notifications/read-all"))
        await page.keyboard.press("Escape")
        await popover.waitFor({ state: "hidden" })
        bannerRevision = 2
        bannerVisible = false
        emit("announcement:banner_changed", { revision: 2 })
        await page.getByRole("region", { name: "顶部公告", exact: true }).waitFor({ state: "hidden" })
        failList = true
        await page.reload()
        if (target === "admin") await main.getByText("加载消息失败", { exact: true }).waitFor()
        else await main.getByText("暂无消息", { exact: true }).waitFor()
        await shot(page, target, account, "error")
        failList = false
        await page.reload()
        await card("Migration Notice One").waitFor()
        items = []
        await page.reload()
        await main.getByText("暂无消息", { exact: true }).waitFor()
        await shot(page, target, account, "empty")
        items = [make("last", "Migration Final Message")]
        loading = true
        gate = new Promise((resolve) => {
          release = resolve
        })
        await page.reload({ waitUntil: "domcontentloaded" })
        await main.getByText("消息通知", { exact: true }).first().waitFor()
        await shot(page, target, account, "loading")
        loading = false
        release()
        await card("Migration Final Message").waitFor()
        if (target === "admin") {
          await page.getByRole("button", { name: "切换语言", exact: true }).click()
          await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
        } else {
          await page
            .getByRole("button")
            .filter({ has: page.locator("svg.iconify--heroicons") })
            .hover()
          await page.getByText("English", { exact: true }).click()
          await page.locator("header button").nth(4).click()
        }
        await page.locator("html.dark").waitFor()
        await shot(page, target, account, "en-dark")
        await page.setViewportSize({ width: 390, height: 844 })
        if (target === "admin")
          await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
        await shot(page, target, account, "en-dark-390")
        await page.getByRole("button", { name: "Notifications", exact: true }).click()
        await page.getByRole("dialog", { name: "Messages", exact: true }).waitFor()
        await shot(page, target, account, "popover-390")
        if (target === "admin") assert.equal(await page.locator("body").evaluate((node) => node.scrollWidth), 390)
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        results.push({ target, account, status: "passed", errors, failures, protocolCalls: calls.length })
        console.log(target, account, "passed")
      } catch (error) {
        release()
        await shot(page, target, account, "failure")
        const result = {
          target,
          account,
          status: "failed",
          message: String(error),
          stack: error.stack,
          errors,
          failures,
        }
        results.push(result)
        console.log(result)
      } finally {
        release()
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(new URL("reviews/notification-center-browser.json", output), JSON.stringify(results, null, 2) + "\n")
}
if (results.some((result) => result.status !== "passed")) process.exitCode = 1
