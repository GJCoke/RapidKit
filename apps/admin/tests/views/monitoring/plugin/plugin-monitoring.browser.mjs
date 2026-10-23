import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { pluginFixtures, pluginPattern } from "./plugin-monitoring-fixtures.mjs"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/plugin-monitoring/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true }),
  results = []
async function until(check) {
  const end = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < end, "condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
async function shot(page, target, account, scene) {
  await page.screenshot({
    path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
    fullPage: true,
    animations: "disabled",
  })
}
async function sourceGraph(page) {
  return page.evaluate(async () => {
    const module = await (await fetch("/src/hooks/common/echarts.ts")).text()
    const url = module.match(/import \* as echarts from "([^"]+)"/)?.[1]
    if (!url) throw new Error("source loaded ECharts core import missing")
    const echarts = await import(url)
    const chart = echarts.getInstanceByDom(document.querySelector("main [_echarts_instance_]"))
    return chart.getOption().series[0]
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
        fixture = pluginFixtures(),
        s = fixture.state,
        main = page.locator("main"),
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
      const checkpoint = (text) => {
        checks.push(text)
        console.log(target, account, checks.length, text)
      }
      async function reload() {
        await page.reload()
        await main.getByText("System", { exact: true }).first().waitFor()
        await until(() => s.calls.length >= 3)
      }
      async function refresh() {
        if (admin) await main.getByRole("button", { name: "刷新", exact: true }).click()
        else await reload()
      }
      async function expand(name) {
        if (admin) await main.getByRole("button", { name: `展开 ${name}`, exact: true }).click()
        else
          await main
            .getByRole("row")
            .filter({ has: page.getByRole("cell", { name, exact: true }) })
            .locator(".n-data-table-expand-trigger")
            .click()
      }
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        const real = page.waitForResponse((response) =>
          /\/(?:api\/v1|proxy-default)\/system\/plugins$/.test(response.url()),
        )
        await page.goto(`${origin}/monitoring/plugin`)
        assert((await real).ok())
        checkpoint("real authenticated plugin list GET")
        await page.route(pluginPattern, fixture.handler)
        await reload()
        assert.deepEqual([...s.calls].sort(), ["events", "graph", "plugins"])
        for (const name of ["System", "Core", "Disabled", "Broken", "Degraded"])
          await main.getByRole("cell", { name, exact: true }).waitFor()
        if (admin) {
          const summary = main.getByRole("region", { name: "插件汇总" })
          assert.equal(await summary.getByText("5", { exact: true }).count(), 1)
          assert.equal(await summary.getByText("2", { exact: true }).count(), 1)
          assert.equal(await summary.getByText("1", { exact: true }).count(), 2)
        } else {
          await main.getByText("插件总数", { exact: true }).locator("..").getByText("5", { exact: true }).waitFor()
          await page.waitForTimeout(1600)
        }
        await shot(page, target, account, "overview-zh-light")
        await expand("System")
        await main.getByText("必需", { exact: false }).last().waitFor()
        await expand("Broken")
        await main.getByText("connection refused", { exact: true }).waitFor()
        await main.getByText("database unavailable", { exact: true }).waitFor()
        await expand("Disabled")
        await main.getByText("该插件已通过 plugins.toml 禁用", { exact: true }).waitFor()
        await shot(page, target, account, "expanded-details")
        checkpoint(
          "all four statuses, summary totals, loaded dependencies/required, failed phase/message/cause, disabled details",
        )
        if (admin) {
          const graph = main.getByRole("figure", { name: "依赖关系图" }),
            svg = graph.locator("svg[viewBox='0 0 640 400']")
          assert.equal(await svg.locator("circle").count(), 5)
          assert.equal(await svg.locator("line[data-dependency]").count(), 3)
          const system = graph.getByRole("button", { name: "System, 已加载, 1.2.3", exact: true })
          await system.focus()
          await graph.getByRole("status").filter({ hasText: "1.2.3" }).waitFor()
          const before = await system.getAttribute("transform"),
            box = await system.locator("circle").boundingBox()
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 30, { steps: 5 })
          await page.mouse.up()
          assert.notEqual(await system.getAttribute("transform"), before)
          const transform = svg.locator(":scope > g"),
            original = await transform.getAttribute("transform"),
            sb = await svg.boundingBox()
          await page.mouse.move(sb.x + 8, sb.y + 8)
          await page.mouse.down()
          await page.mouse.move(sb.x + 48, sb.y + 38, { steps: 5 })
          await page.mouse.up()
          assert.notEqual(await transform.getAttribute("transform"), original)
          await graph.getByRole("button", { name: "放大", exact: true }).click()
          await graph.getByText("125%", { exact: true }).waitFor()
          await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
          await page.mouse.wheel(0, -100)
          await graph.getByText("135%", { exact: true }).waitFor()
          await graph.getByRole("button", { name: "重置视图", exact: true }).click()
          await graph.getByText("100%", { exact: true }).waitFor()
          await graph.getByRole("button", { name: "失败", exact: true }).click()
          assert.equal(await svg.locator("circle").count(), 4)
          assert.equal(await svg.locator("line[data-dependency]").count(), 2)
          await graph.getByRole("button", { name: "失败", exact: true }).click()
          assert.equal(await svg.locator("circle").count(), 5)
          await shot(page, target, account, "dependency-interactions")
        } else {
          const chart = await sourceGraph(page)
          assert.equal(chart.type, "graph")
          assert.equal(chart.data.length, 5)
          assert.equal(chart.links.length, 3)
          assert.equal(chart.roam, true)
          assert.deepEqual(chart.edgeSymbol, ["none", "arrow"])
          assert.equal(chart.data.find((node) => node.name === "System").value, "1.2.3")
          const canvas = main.locator("canvas"),
            box = await canvas.boundingBox()
          assert(box.width > 0 && box.height > 0)
          await canvas.hover()
          await page.mouse.wheel(0, -100)
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 5 })
          await page.mouse.up()
          await shot(page, target, account, "dependency-interactions")
        }
        checkpoint("directed graph nodes/edges/version, actual pan and wheel zoom; target node drag, legend and reset")
        const errorTable = admin
          ? main.getByRole("table", { name: "处理器错误" })
          : main.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Count", exact: true }) })
        assert.match(await errorTable.getByRole("row").nth(1).textContent(), /notification.failed.*9/)
        await main.getByText("delivery.failed", { exact: true }).waitFor()
        await main.getByText("Mailer", { exact: true }).waitFor()
        await main.getByText("23", { exact: false }).last().waitFor()
        await shot(page, target, account, "events")
        checkpoint("handler error count descending and dead-letter events, total, timestamps and optional source")
        s.empty = true
        if (admin) {
          await refresh()
          await main.getByRole("figure", { name: "依赖关系图" }).getByText("暂无数据", { exact: true }).waitFor()
          assert.equal(await main.locator("[data-node]").count(), 0)
        } else {
          await page.reload()
          await main.getByText("无处理器错误", { exact: true }).waitFor()
        }
        await shot(page, target, account, "empty")
        s.empty = false
        let release
        const gate = new Promise((resolve) => {
          release = resolve
        })
        s.gates.set("plugins", gate)
        await page.reload({ waitUntil: "domcontentloaded" })
        await until(() => s.calls.filter((kind) => kind === "plugins").length >= 3)
        await shot(page, target, account, "loading")
        release()
        s.gates.delete("plugins")
        await main.getByRole("cell", { name: "System", exact: true }).waitFor()
        s.fail.add("events")
        await refresh()
        if (admin) {
          await main.getByRole("alert").waitFor()
          s.fail.delete("events")
          await main.getByRole("alert").getByRole("button", { name: "重试", exact: true }).click()
        } else {
          await page.getByText("Plugin monitoring fixture failure", { exact: true }).last().waitFor()
          s.fail.delete("events")
          await refresh()
        }
        await main.getByText("delivery.failed", { exact: true }).waitFor()
        await main.getByRole("cell", { name: "System", exact: true }).waitFor()
        checkpoint("three-resource empty/loading and partial failure/retry with other plugin information retained")
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
        await main
          .getByText(admin ? "Plugin Monitoring" : "Total Plugins", { exact: true })
          .first()
          .scrollIntoViewIfNeeded()
        await shot(page, target, account, "overview-en-dark-390")
        await main.getByText("Dependency Graph", { exact: true }).first().scrollIntoViewIfNeeded()
        if (admin) {
          const labels = await main.locator("svg [data-node] text").all()
          for (const label of labels)
            assert((await label.boundingBox()).height >= 11, "mobile graph labels must retain readable screen size")
        }
        await shot(page, target, account, "graph-en-dark-390")
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        await main.getByText("EventBus Statistics", { exact: true }).scrollIntoViewIfNeeded()
        await shot(page, target, account, "events-en-dark-390")
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        checkpoint("English dark theme and 390px dependency graph, plugin table and event tables")
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        assert.deepEqual(consoleErrors, [])
        results.push({ target, account, checks, errors, failures, consoleErrors, calls: s.calls })
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
  await writeFile(new URL("plugin-monitoring-browser-results.json", output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
