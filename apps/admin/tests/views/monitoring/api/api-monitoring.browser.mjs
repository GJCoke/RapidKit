import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { monitoringFixtures, monitoringPattern } from "./api-monitoring-fixtures.mjs"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/api-monitoring/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true }),
  results = []
async function until(check) {
  const deadline = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < deadline, "fixture condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
async function shot(page, target, account, scene) {
  if (!scene.includes("tooltip")) await page.mouse.move(1, 1)
  await page.screenshot({
    path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
    fullPage: true,
    animations: "disabled",
  })
}
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          timezoneId: "America/New_York",
        }),
        page = await context.newPage(),
        admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        fixture = monitoringFixtures(),
        s = fixture.state,
        checks = [],
        errors = [],
        failures = [],
        consoleErrors = [],
        sockets = [],
        main = page.locator("main")
      page.setDefaultTimeout(15000)
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      await page.routeWebSocket(/\/socket\.io\//, (socket) => {
        const server = socket.connectToServer()
        server.onMessage((data) => {
          const value = String(data)
          if (value.startsWith("40/dashboard,")) sockets.push(socket)
          if (value.startsWith("42/dashboard,") && value.includes('"dashboard:api_stats"')) return
          socket.send(data)
        })
      })
      const checkpoint = (text) => {
          checks.push(text)
          console.log(target, account, "checkpoint", checks.length, text)
        },
        table = () => main.getByRole("table").last(),
        visible = () => table().getByRole("cell", { name: s.rows[0].path, exact: true }).waitFor(),
        lastList = () => s.calls.filter((call) => call.kind === "list").at(-1),
        rangeButton = (value) =>
          main.getByRole("button", {
            name: { "1h": "近1小时", "6h": "近6小时", "24h": "近24小时", "7d": "近7天" }[value],
            exact: true,
          }),
        refresh = () =>
          admin ? main.getByRole("button", { name: "刷新", exact: true }).click() : rangeButton("24h").click(),
        keyword = () =>
          admin
            ? main.getByRole("textbox", { name: "路径", exact: true })
            : main.getByPlaceholder("按路径搜索", { exact: true }),
        card = (title) => main.getByText(title, { exact: true }).locator("..")
      async function selectMethod(method) {
        if (admin) {
          await main.getByRole("combobox", { name: "方法", exact: true }).click()
          await page.getByRole("option", { name: method, exact: true }).click()
        } else {
          await main.locator(".n-select").first().click()
          await page
            .locator(".n-base-select-option")
            .filter({ hasText: method })
            .filter({ visible: true })
            .last()
            .click()
        }
      }
      async function sort(field) {
        if (admin)
          await main
            .getByRole("columnheader")
            .getByRole("button", { name: new RegExp(`^${field}`) })
            .click()
        else await main.getByRole("columnheader", { name: field, exact: true }).click()
      }
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        const token = await page.evaluate(
            (admin) =>
              admin
                ? localStorage.getItem("accessToken")
                : JSON.parse(localStorage.getItem("RAPIDKIT_token") || "null"),
            admin,
          ),
          profile = await page.request.get("http://localhost:16000/api/v1/auth/user/info", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          user = (await profile.json()).data
        const real = page.waitForResponse((response) =>
          /\/(?:api\/v1|proxy-default)\/system\/stats\/api\/overview/.test(response.url()),
        )
        await page.goto(`${origin}/monitoring/api`)
        assert((await real).ok())
        checkpoint("real authenticated overview GET before fixtures")
        await page.route(monitoringPattern, fixture.handler)
        sockets.length = 0
        await page.reload()
        await visible()
        await until(() => s.calls.length >= 6)
        await card("总请求数").getByText("1,000", { exact: true }).waitFor()
        assert.equal(s.calls.filter((call) => call.kind === "top").length, 2)
        assert.equal(lastList().query.sortBy, "request_count")
        if (!admin) await page.waitForTimeout(1200) // Wait for the source ECharts entry animation before visual comparison.
        await shot(page, target, account, "overview-zh-light")
        if (admin) {
          await until(async () => (await main.locator(".recharts-pie-sector path").count()) > 0)
          assert.equal(await main.locator("figure .recharts-wrapper > svg.recharts-surface").count(), 4)
          assert((await main.locator(".recharts-bar-rectangle path").count()) > 0)
          for (const figure of await main.getByRole("figure").all()) assert((await figure.boundingBox())?.width > 0)
        } else {
          assert.equal(await main.locator("canvas").count(), 4)
          for (const canvas of await main.locator("canvas").all()) {
            const box = await canvas.boundingBox()
            assert(box && box.width > 0 && box.height > 0)
          }
        }
        checkpoint("four summary cards, distribution, dual-axis trend and two real ranking charts")
        if (admin) {
          await main.locator(".recharts-bar-rectangle path").first().hover()
          await main.getByRole("tooltip").waitFor()
          assert((await main.getByRole("tooltip").innerText()).includes("2026-11-01"))
        } else {
          const canvas = main.locator("canvas").nth(1)
          const box = await canvas.boundingBox()
          assert(box)
          await canvas.hover({ position: { x: box.width / 2, y: box.height / 2 } })
        }
        await shot(page, target, account, "trend-tooltip")
        await page.mouse.move(1, 1)

        await table().scrollIntoViewIfNeeded()
        const count = s.calls.length
        await keyword().fill("migration")
        assert.equal(s.calls.length, count)
        await keyword().press("Enter")
        await until(() => s.calls.length > count)
        assert.equal(s.calls.at(-1).kind, "list")
        assert.equal(lastList().query.keyword, "migration")
        await visible()
        if (admin) await main.getByRole("button", { name: "下一页", exact: true }).click()
        else await main.locator(".n-pagination-item").getByText("2", { exact: true }).click()
        await until(() => lastList().query.page === "2")
        for (const order of ["desc", "asc"]) {
          const sortCalls = s.calls.length
          await sort("P95 响应时间")
          await until(() => s.calls.length > sortCalls)
          assert.equal(lastList().query.sortBy, "p95_ms")
          assert.equal(lastList().query.sortOrder, order)
          assert.equal(lastList().query.page, "2")
        }
        const clearCount = s.calls.length
        await sort("P95 响应时间")
        await until(() => s.calls.length > clearCount)
        assert.equal(lastList().query.sortBy, admin ? "request_count" : "p95_ms")
        assert.equal(lastList().query.sortOrder, "desc")
        console.log(target, account, "clear-sort query", lastList().query)
        checkpoint(
          "draft search, Enter, pagination and three-state remote sort; source clear-order baseline retained in evidence",
        )
        for (const [label, field] of [
          ["请求数", "request_count"],
          ["失败数", "error_count"],
          ["错误率", "error_rate"],
          ["平均响应时间", "avg_ms"],
        ]) {
          const n = s.calls.length
          await sort(label)
          await until(() => s.calls.length > n)
          assert.equal(lastList().query.sortBy, field)
          assert.equal(lastList().query.sortOrder, "desc")
          assert.equal(lastList().query.page, "2")
        }
        const restoreSort = s.calls.length
        await sort("请求数")
        await until(() => s.calls.length > restoreSort)
        assert.equal(lastList().query.sortBy, "request_count")
        assert.equal(lastList().query.sortOrder, "desc")

        await main.getByRole("button", { name: "重置", exact: true }).click()
        await until(() => lastList().query.page === "1" && !lastList().query.keyword)
        await visible()
        await selectMethod("GET")
        await main.getByRole("button", { name: "搜索", exact: true }).click()
        await until(() => (admin ? lastList().query.pageSize === "500" : lastList().query.method === "GET"))
        await table().getByRole("cell", { name: s.rows[0].path, exact: true }).waitFor()
        const methods = await table().getByRole("row").allTextContents()
        if (admin) {
          assert(
            methods.every(
              (text) =>
                !text.includes("POST") && !text.includes("PUT") && !text.includes("DELETE") && !text.includes("PATCH"),
            ),
          )
          assert(!lastList().query.method)
        } else assert(methods.some((text) => text.includes("POST")))
        checkpoint(
          "method control preserved; target filters full legal dataset, source unsupported-method defect documented",
        )
        await main.getByRole("button", { name: "重置", exact: true }).click()
        await visible()
        const rangeCount = s.calls.length
        await rangeButton("6h").click()
        await until(() => s.calls.length >= rangeCount + 6)
        assert(s.calls.slice(rangeCount).every((call) => call.query.range === "6h"))
        await visible()
        await rangeButton("24h").click()
        await until(() => lastList().query.range === "24h")
        await visible()
        checkpoint("range updates all six queries and preserves applied filtering semantics")
        if (user.isAdmin) {
          await until(() => sockets.length > 0)
          sockets
            .at(-1)
            .send(
              `42/dashboard,${JSON.stringify(["dashboard:api_stats", { deltaRequests: 7, deltaErrors: 2, errorRate: 9, topFailures: [] }])}`,
            )
          await card("总请求数").getByText("1,007", { exact: true }).waitFor()
          await card("总失败数").getByText("52", { exact: true }).waitFor()
          await card("平均错误率").getByText("9%", { exact: true }).waitFor()
          checkpoint("real dashboard namespace packet updates request/error totals and rate only")
        } else {
          assert.equal(sockets.length, 0)
          checkpoint("ordinary reader opens no admin dashboard namespace")
        }
        s.empty = true
        await refresh()
        await main
          .getByText(admin ? "暂无数据" : "无数据", { exact: true })
          .first()
          .waitFor()
        await shot(page, target, account, "empty")
        s.empty = false
        let release
        const gate = new Promise((resolve) => {
          release = resolve
        })
        s.gates.set("list", gate)
        const gateCount = s.calls.length
        await refresh()
        await until(() => s.calls.slice(gateCount).some((call) => call.kind === "list"))
        await shot(page, target, account, "loading")
        release()
        s.gates.delete("list")
        await visible()
        s.fail.add("list")
        await refresh()
        if (admin) {
          await main.getByText("数据加载失败", { exact: true }).waitFor()
          s.fail.delete("list")
          await main.getByRole("button", { name: "重试", exact: true }).click()
        } else {
          await page.getByText("API monitoring fixture failure", { exact: true }).last().waitFor()
          s.fail.delete("list")
          await refresh()
        }
        await visible()
        s.fail.add("overview")
        await refresh()
        if (admin) {
          const summary = main.getByRole("region", { name: "API 汇总", exact: true })
          await summary.getByRole("alert").waitFor()
          assert.equal(await summary.getByText("1,000", { exact: true }).count(), 0)
          s.fail.delete("overview")
          await summary.getByRole("button", { name: "重试", exact: true }).click()
        } else {
          await page.getByText("API monitoring fixture failure", { exact: true }).last().waitFor()
          s.fail.delete("overview")
          await refresh()
        }
        await card("总请求数").getByText("1,000", { exact: true }).waitFor()
        checkpoint("empty/loading/list failure and retry; summary failure does not present false zero on target")
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
        await page.setViewportSize({ width: 390, height: 844 })
        await main.getByText("API Monitoring", { exact: true }).first().scrollIntoViewIfNeeded()
        await shot(page, target, account, "overview-en-dark-390")
        if (admin) {
          assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          await main.locator(".recharts-bar-rectangle path").first().hover()
          await main.getByRole("tooltip").waitFor()
          await until(async () => {
            const box = await main.getByRole("tooltip").boundingBox()
            return box && box.x >= 0 && box.x + box.width <= 391
          })
          assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          await shot(page, target, account, "trend-tooltip-en-dark-390")
          await page.mouse.move(1, 1)
        }
        await table().scrollIntoViewIfNeeded()
        await shot(page, target, account, "detail-en-dark-390")
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        checkpoint("English dark theme, 390px charts and horizontally contained detail table")
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        assert.deepEqual(consoleErrors, [])
        results.push({ target, account, checks, errors, failures, consoleErrors, calls: s.calls.length })
      } catch (error) {
        await shot(page, target, account, "failure").catch(() => {})
        results.push({ target, account, error: String(error), checks, errors, failures, consoleErrors })
        console.error(target, account, error)
        process.exitCode = 1
      } finally {
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(new URL("api-monitoring-browser-results.json", output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
