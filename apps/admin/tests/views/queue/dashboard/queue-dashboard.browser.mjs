import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { queueFixtures, queuePattern, onlineId, offlineId, staleId, newId } from "./queue-fixtures.mjs"

const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/queue-dashboard/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true }),
  results = []
async function until(check) {
  const deadline = Date.now() + 15000
  while (!check()) {
    assert(Date.now() < deadline, "fixture condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
async function shot(page, target, account, scene) {
  await page.mouse.move(1, 1)
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
          timezoneId: "Asia/Shanghai",
        }),
        page = await context.newPage(),
        admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        path = "/queue/dashboard",
        errors = [],
        failures = [],
        consoleErrors = [],
        checks = [],
        fixture = queueFixtures(),
        s = fixture.state,
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
      const sockets = []
      await page.routeWebSocket(/\/socket\.io\//, (socket) => {
        const server = socket.connectToServer()
        server.onMessage((data) => {
          if (String(data).startsWith("40/worker,")) sockets.push(socket)
          socket.send(data)
        })
      })
      const emit = async (event, payload) => sockets.at(-1).send(`42/worker,${JSON.stringify([event, payload])}`)
      const checkpoint = (text) => {
        checks.push(text)
        console.log(target, account, "checkpoint", checks.length, text)
      }
      const drawer = () =>
        admin
          ? page.getByRole("dialog", { name: "Worker 详情", exact: true })
          : page.locator(".n-drawer-content:visible")
      const card = (name) =>
        admin
          ? main.getByRole("region", { name: "Worker 状态", exact: true }).getByRole("button", { name, exact: true })
          : main.locator(".n-card--hoverable").filter({ hasText: name })
      const open = async (name) => {
        await card(name).click()
        await drawer().getByText(name, { exact: true }).last().waitFor()
      }
      const close = async () => {
        if (admin) await drawer().locator('[data-slot="sheet-footer"] button').click()
        else await drawer().locator(".n-drawer-header__close").click()
        await drawer().waitFor({ state: "hidden" })
      }
      const tab = async (name) => {
        if (admin) await drawer().getByRole("tab", { name, exact: true }).click()
        else await drawer().getByText(name, { exact: true }).click()
      }
      const refresh = async () => {
        await main.getByRole("button", { name: "刷新", exact: true }).first().click()
        await until(() => s.overviewQueries.length > 0)
        await card("worker@migration-parity-long-hostname").waitFor()
      }
      const confirm = async (title) => {
        if (admin)
          await page
            .getByRole("alertdialog", { name: title, exact: true })
            .getByRole("button", { name: "确定", exact: true })
            .click()
        else await page.locator(".n-popconfirm:visible").getByRole("button", { name: "确认", exact: true }).click()
      }
      const englishDark = async () => {
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
        const profile = await page.request.get("http://localhost:16000/api/v1/auth/user/info", {
          headers: {
            Authorization: `Bearer ${await page.evaluate((admin) => (admin ? localStorage.getItem("accessToken") : JSON.parse(localStorage.getItem("RAPIDKIT_token") || "null")), admin)}`,
          },
        })
        assert(profile.ok())
        const profileBody = await profile.json()
        assert.equal(profileBody.code, 0)
        const user = profileBody.data,
          canControl = user.isAdmin || user.buttons.includes("worker:control")
        console.log(
          target,
          account,
          "queue permissions",
          user.buttons.filter((code) => code.startsWith("worker:") || code === "task:stats"),
          canControl,
        )
        {
          const real = page.waitForResponse(
            (response) =>
              queuePattern.test(response.url()) &&
              response.url().includes("/workers/all") &&
              response.request().method() === "GET",
          )
          await page.goto(`${origin}${path}`)
          assert((await real).ok())
          await main.getByText("队列运行总览", { exact: true }).waitFor()
          checkpoint("real authenticated inventory and dashboard load before fixtures")
          await page.route(queuePattern, fixture.handler)
          sockets.length = 0
          await page.reload()
          await card("worker@migration-parity-long-hostname").waitFor()
          await until(() => sockets.length > 0)
          await main.getByText("队列 stuck 有 5 个待消费任务，但没有在线消费者", { exact: true }).waitFor()
          for (const name of [
            "待消费任务",
            "正在执行",
            "完成速率",
            "成功率",
            "P95 执行耗时",
            "任务完成趋势",
            "队列积压趋势",
            "任务处理量排行",
            "Worker 处理量排行",
          ])
            assert((await main.getByText(name, { exact: true }).count()) > 0)
          const rows = main.locator("tbody tr")
          assert.match(await rows.first().innerText(), /stuck/)
          const unknown = rows.filter({ hasText: "unavailable" })
          assert.match(await unknown.innerText(), /采集不可用/)
          assert.match(await unknown.innerText(), /[—-]/)
          if (admin)
            await page.waitForFunction(() => {
              const chart = document.querySelector('[aria-label="任务完成趋势"]')
              return chart?.querySelectorAll("path.recharts-line-curve[d]").length === 2
            })
          await shot(page, target, account, "overview")
          for (const [label, days] of [
            ["7 天", 7],
            ["30 天", 30],
            ["24 小时", 1],
          ]) {
            const before = s.overviewQueries.length
            if (admin) await main.getByRole("button", { name: label, exact: true }).click()
            else await main.locator(".n-radio__label").getByText(label, { exact: true }).click()
            await until(() => s.overviewQueries.length > before && s.overviewQueries.at(-1).days === String(days))
            await until(
              () =>
                s.taskQueries.length > 0 &&
                Date.parse(s.taskQueries.at(-1).endTime) - Date.parse(s.taskQueries.at(-1).startTime) ===
                  days * 86400000,
            )
          }
          checkpoint("five metrics, four charts, blocked/unknown queue states and all day windows")
          await open("worker@migration-parity-long-hostname")
          await drawer().getByText("67%", { exact: true }).waitFor()
          assert.equal(s.inspections.length, 0)
          await drawer().getByText("运行环境", { exact: true }).click()
          await drawer().getByText("Linux arm64", { exact: true }).waitFor()
          assert.match(await drawer().innerText(), /3\.13\.0/)
          await shot(page, target, account, "worker-detail")
          await tab("任务现场")
          await drawer().getByText("migration.active.task", { exact: true }).waitFor()
          await drawer().getByText("migration.reserved.task", { exact: true }).waitFor()
          assert.equal(s.inspections.length, 2)
          await drawer().getByText("任务参数", { exact: true }).first().click()
          await drawer().getByText("['example', 1]", { exact: true }).filter({ visible: true }).waitFor()
          await drawer().getByText("{'enabled': False}", { exact: true }).filter({ visible: true }).waitFor()
          assert.equal(await drawer().getByText("PID 412", { exact: true }).count(), 2)
          await tab("运行概览")
          await tab("任务现场")
          assert.equal(s.inspections.length, 2)
          s.failActive = true
          await drawer()
            .getByRole("button", { name: admin ? "刷新正在执行" : "刷新", exact: true })
            .first()
            .click()
          await drawer().getByText("更新失败，以下保留上次采集结果，请重试。", { exact: true }).waitFor()
          assert.equal(await drawer().getByText("migration.active.task", { exact: true }).count(), 1)
          s.failActive = false
          await drawer()
            .getByRole("button", { name: admin ? "刷新正在执行" : "刷新", exact: true })
            .first()
            .click()
          await until(() => s.inspections.length >= 6)
          await shot(page, target, account, "task-snapshots")
          checkpoint(
            "runtime, environment, first-visit task snapshots, manual refresh and retained independent failed samples",
          )
          const beforeReconnect = s.inspections.length
          await emit("worker:status", fixture.statusEvent(onlineId, { status: "2" }))
          await drawer().getByText("Worker 离线或心跳过期，暂不可采集任务。", { exact: true }).first().waitFor()
          await emit("worker:status", fixture.statusEvent(onlineId, { status: "1" }))
          await drawer().getByText("在线", { exact: true }).first().waitFor()
          assert.equal(await drawer().getByText("migration.active.task", { exact: true }).count(), 0)
          assert.equal(s.inspections.length, beforeReconnect)
          await drawer()
            .getByRole("button", { name: admin ? "刷新正在执行" : "刷新", exact: true })
            .first()
            .click()
          await until(() => s.inspections.length === beforeReconnect + 2)
          await drawer().getByText("migration.active.task", { exact: true }).waitFor()
          if (canControl) {
            await tab("运维操作")
            const processCount = admin
              ? drawer().getByRole("spinbutton", { name: "进程数调整", exact: true })
              : drawer().locator(".n-input-number input")
            await processCount.fill("")
            await processCount.press("Tab")
            await page.waitForFunction(
              () =>
                [...document.querySelectorAll("button")].find((button) => button.textContent?.startsWith("扩容"))
                  ?.disabled,
            )
            assert(
              await drawer()
                .getByRole("button", { name: /^扩容/ })
                .isDisabled(),
            )
            await processCount.fill("3")
            assert(
              await drawer()
                .getByRole("button", { name: /^缩容/ })
                .isDisabled(),
            )
            await processCount.fill("1")
            const manualSamples = s.inspections.length
            s.pingSuccess = false
            await drawer().getByRole("button", { name: "Ping", exact: true }).click()
            await page
              .getByText("Worker 未确认操作成功，请检查后重试。", { exact: true })
              .filter({ visible: true })
              .waitFor()
            assert.equal(s.commands.at(-1).action, "ping")
            s.pingSuccess = true
            let release
            s.commandGate = new Promise((resolve) => {
              release = resolve
            })
            const beforePing = s.commands.length
            await drawer().getByRole("button", { name: "Ping", exact: true }).click()
            await until(() => s.commands.length === beforePing + 1)
            await page.waitForFunction(
              () =>
                [...document.querySelectorAll("button")].find((button) => button.textContent?.startsWith("扩容"))
                  ?.disabled,
            )
            assert(
              await drawer()
                .getByRole("button", { name: /^扩容/ })
                .isDisabled(),
            )
            assert(await drawer().getByPlaceholder("请输入队列名称").isDisabled())
            await shot(page, target, account, "command-pending")
            release()
            s.commandGate = null
            await drawer()
              .getByRole("button", { name: /^扩容/ })
              .waitFor()

            await drawer()
              .getByRole("button", { name: /^扩容/ })
              .click()
            await until(() => s.commands.at(-1).action === "pool/grow")
            await drawer()
              .getByText(/^当前并发数\s+4$/)
              .waitFor()
            await drawer()
              .getByRole("button", { name: /^缩容/ })
              .click()
            await confirm("缩容")
            await until(() => s.commands.at(-1).action === "pool/shrink")
            const queue = drawer().getByPlaceholder("请输入队列名称"),
              subscribe = drawer().getByRole("button", { name: "订阅队列", exact: true })
            await queue.fill("celery")
            assert(await subscribe.isDisabled())
            await queue.fill("  migration-extra  ")
            s.commandFailed = true
            await subscribe.click()
            await until(() => s.commands.at(-1).action === "queues/add")
            await until(() => !s.commandGate)
            if (admin) await drawer().getByText("Worker 未确认操作成功，请检查后重试。", { exact: true }).waitFor()
            else await page.getByText("Worker command failed", { exact: true }).filter({ visible: true }).waitFor()
            assert.equal(await queue.inputValue(), "  migration-extra  ")
            s.commandFailed = false
            await subscribe.click()
            await until(() => s.workers[0].activeQueues.includes("migration-extra"))
            await page.waitForFunction(
              () => document.querySelector('input[placeholder="请输入队列名称"]')?.value === "",
            )
            const stop = admin
              ? drawer().getByRole("button", { name: "停止订阅 migration-extra", exact: true })
              : drawer()
                  .locator(".flex.items-center.justify-between")
                  .filter({ hasText: "migration-extra" })
                  .getByRole("button", { name: "停止订阅", exact: true })
            await stop.click()
            await confirm("停止订阅")
            await until(() => !s.workers[0].activeQueues.includes("migration-extra"))
            assert.equal(s.inspections.length, manualSamples)
            await close()
            checkpoint(
              "ping false acknowledgement, pending locks, pool resize confirmations and trimmed subscriptions with failure retention",
            )
          } else {
            assert.equal(await drawer().getByText("运维操作", { exact: true }).count(), 0)
            await close()
            if (admin) assert.equal(await main.getByRole("button", { name: /^关闭 Worker / }).count(), 0)
            else assert.equal(await main.locator(".n-card--hoverable button").count(), 0)
            assert.equal(s.commands.length, 0)
            checkpoint(
              "ordinary account may inspect workers but has no operations tab, shutdown action or command writes",
            )
          }
          for (const [id, name, health] of [
            [offlineId, "offline@migration", "离线"],
            [staleId, "stale@migration", "心跳过期"],
          ]) {
            const count = s.inspections.length
            await open(name)
            await drawer().getByText(health, { exact: true }).first().waitFor()
            await tab("任务现场")
            await drawer().getByText("Worker 离线或心跳过期，暂不可采集任务。", { exact: true }).first().waitFor()
            assert.equal(s.inspections.length, count)
            if (canControl) {
              await tab("运维操作")
              assert(await drawer().getByRole("button", { name: "Ping", exact: true }).isDisabled())
            }
            await close()
          }
          s.runtimeUnknown = true
          await open("worker@migration-parity-long-hostname")
          await drawer().getByText("实时状态暂未采集到，请刷新确认；不能视为 0。", { exact: true }).waitFor()
          assert.equal(await drawer().getByText("0%", { exact: true }).count(), 0)
          await close()
          s.runtimeUnknown = false
          await main.getByText("实时连接", { exact: true }).waitFor()
          await emit("worker:status", fixture.statusEvent(onlineId, { processedCount: 99 }))
          await until(() => s.overviewQueries.length > 0)
          const extra = fixture.addWorker()
          await emit("worker:status", fixture.statusEvent(extra.id))
          await card("new@migration").waitFor()
          const beforeEvent = s.overviewQueries.length
          await emit("task:update", { id: "migration-task", status: "SUCCESS" })
          await emit("task:update", { id: "migration-task", status: "SUCCESS" })
          await until(() => s.overviewQueries.length > beforeEvent)
          if (canControl) {
            if (admin) await main.getByRole("button", { name: "关闭 Worker new@migration", exact: true }).click()
            else await card("new@migration").getByRole("button").click()
            await shot(page, target, account, "shutdown-confirm")
            await confirm("关闭 Worker")
            await until(() => s.commands.at(-1).action === "shutdown")
            assert.equal(s.commands.at(-1).id, newId)
            assert.deepEqual(
              new Set(s.commands.map((command) => command.action)),
              new Set(["ping", "pool/grow", "pool/shrink", "queues/add", "queues/cancel", "shutdown"]),
            )
          } else assert.equal(s.commands.length, 0)
          checkpoint(
            "offline/stale and unknown runtime stay distinct; real socket events refresh stats/inventory; shutdown confirmation",
          )
          s.failOverview = true
          s.failTasks = true
          s.failWorkerRank = true
          const beforeFailure = s.overviewQueries.length
          await refresh()
          await until(() => s.overviewQueries.length > beforeFailure)
          await main.getByText("概览采集失败，请稍后刷新", { exact: true }).waitFor()
          await main.getByText("排行更新失败，请稍后刷新", { exact: true }).first().waitFor()
          assert.equal(await card("worker@migration-parity-long-hostname").count(), 1)
          await shot(page, target, account, "partial-failure")
          s.failOverview = s.failTasks = s.failWorkerRank = false
          await refresh()
          s.sampleAge = 180000
          await refresh()
          await main.getByText("数据已过期，正在重新采集", { exact: true }).waitFor()
          s.sampleAge = 0
          s.empty = true
          await page.reload()
          await main.getByText("暂无 Worker", { exact: true }).waitFor()
          await main.getByText("暂无已发现队列", { exact: true }).waitFor()
          await shot(page, target, account, "empty")
          s.empty = false
          let releaseRead
          s.readGate = new Promise((resolve) => {
            releaseRead = resolve
          })
          await page.reload({ waitUntil: "domcontentloaded" })
          if (admin) await main.getByRole("status").first().waitFor()
          else await main.locator(".n-spin").first().waitFor()
          await shot(page, target, account, "loading")
          releaseRead()
          s.readGate = null
          await card("worker@migration-parity-long-hostname").waitFor()
          s.failWorkers = true
          const beforeWorkers = s.inventories
          await refresh()
          await until(() => s.inventories > beforeWorkers)
          if (admin) await main.getByText("Worker 列表加载失败，请刷新重试", { exact: true }).waitFor()
          else await page.getByText("Worker inventory failed", { exact: true }).filter({ visible: true }).waitFor()
          assert.equal(await card("worker@migration-parity-long-hostname").count(), 1)
          s.failWorkers = false
          await refresh()
          checkpoint(
            "partial statistics errors retain snapshots; stale collection, empty, loading, failed inventory and retry",
          )
          await open("worker@migration-parity-long-hostname")
          await tab("任务现场")
          await drawer().getByText("migration.active.task", { exact: true }).waitFor()
          const savedWorker = s.workers.find((worker) => worker.id === onlineId),
            inventoryEvent = { ...fixture.statusEvent(onlineId), hostname: "inventory-refresh" }
          s.workers = s.workers.filter((worker) => worker.id !== onlineId)
          await emit("worker:status", inventoryEvent)
          await drawer().getByText("该 Worker 已不在当前列表，请关闭详情后刷新。", { exact: true }).first().waitFor()
          s.workers.unshift(savedWorker)
          await emit("worker:status", inventoryEvent)
          if (admin)
            await page.waitForFunction(
              () =>
                [...document.querySelectorAll('[role="tab"]')]
                  .find((tab) => tab.textContent === "运行概览")
                  ?.getAttribute("aria-selected") === "true",
            )
          else await drawer().locator(".n-tabs-tab--active").getByText("运行概览", { exact: true }).waitFor()
          await close()
          const returnToDashboard = async () => {
            sockets.length = 0
            await page.goto(`${origin}${path}`)
            await card("worker@migration-parity-long-hostname").waitFor()
            await until(() => sockets.length > 0)
          }
          const checkRecordURL = async (action, filter, custom = true) => {
            const before = Date.now()
            const records = page.waitForResponse(
              (response) =>
                /\/(?:api\/v1|proxy-default)\/tasks(?:\?|$)/.test(response.url()) &&
                response.request().method() === "GET",
            )
            await action()
            await page.waitForURL((url) => url.pathname === "/queue/task")
            const recordResponse = await records
            assert(recordResponse.ok())
            const recordQuery = new URL(recordResponse.url()).searchParams
            await main.getByRole("button", { name: "执行记录", exact: true }).waitFor()
            assert.equal(recordQuery.get("page"), "1")
            assert.equal(recordQuery.get("pageSize"), "20")
            assert.equal(recordQuery.get("taskNameMatch"), filter.task ? "exact" : "contains")
            for (const [key, value] of Object.entries(filter))
              assert.equal(
                recordQuery.get(key === "task" ? "taskName" : key === "worker" ? "workerHostname" : key),
                value,
              )
            const query = new URL(page.url()).searchParams
            assert.equal(query.get("view"), "records")
            for (const [key, value] of Object.entries(filter)) assert.equal(query.get(key), value)
            assert.equal(query.get("range"), custom ? "custom" : "7d")
            if (custom) {
              const start = Date.parse(query.get("startTime")),
                end = Date.parse(query.get("endTime"))
              assert.equal(end - start, 86400000)
              assert(end >= before - 1000 && end <= Date.now() + 1000)
              assert.equal(Date.parse(recordQuery.get("startTime")), start)
              assert.equal(Date.parse(recordQuery.get("endTime")), end)
            }
            await returnToDashboard()
          }
          await checkRecordURL(() => main.getByRole("button", { name: /^所选时间段有 2 个失败任务$/ }).click(), {
            status: "4",
          })
          for (const [title, name, key] of [
            ["任务处理量排行", "migration.sample", "task"],
            ["Worker 处理量排行", "worker@migration-parity-long-hostname", "worker"],
          ]) {
            await checkRecordURL(
              async () => {
                if (admin)
                  await main
                    .getByRole("group", { name: title, exact: true })
                    .getByRole("button", { name, exact: true })
                    .click()
                else {
                  const chart = main.getByRole("img", { name: title, exact: true })
                  await chart.scrollIntoViewIfNeeded()
                  const bounds = await chart.boundingBox()
                  assert(bounds)
                  await chart.click({ position: { x: bounds.width * 0.65, y: 144 } })
                }
              },
              { [key]: name },
            )
          }
          await open("worker@migration-parity-long-hostname")
          await checkRecordURL(
            () => drawer().getByRole("button", { name: "查看记录", exact: true }).click(),
            { worker: "worker@migration-parity-long-hostname" },
            false,
          )
          checkpoint(
            "removed workers reset detail state; failed/task/worker rankings and drawer links preserve exact record filters and UTC windows",
          )
          await englishDark()
          await main.getByText("Queue operations overview", { exact: true }).waitFor()
          await shot(page, target, account, "en-dark")
          await page.setViewportSize({ width: 390, height: 844 })
          await shot(page, target, account, "en-dark-390")
          const bounds = await page.evaluate(() => ({ width: document.body.scrollWidth, viewport: innerWidth }))
          assert(bounds.width <= bounds.viewport + 1)
          const name = "worker@migration-parity-long-hostname"
          if (admin)
            await main
              .getByRole("region", { name: "Worker Status", exact: true })
              .getByRole("button", { name, exact: true })
              .click()
          else await main.locator(".n-card--hoverable").filter({ hasText: name }).click()
          const englishDrawer = admin
            ? page.getByRole("dialog", { name: "Worker Detail", exact: true })
            : page.locator(".n-drawer-content:visible")
          await englishDrawer.getByText(name, { exact: true }).last().waitFor()
          await shot(page, target, account, "en-dark-390-detail")
          const box = await englishDrawer.boundingBox()
          assert(box && box.x >= -1 && box.x + box.width <= 391)
          checkpoint("English, dark theme, 390px overview and complete worker detail fit viewport")
        }
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        assert.deepEqual(consoleErrors, [])
        results.push({ target, account, status: "passed", checks, errors, failures, consoleErrors })
        console.log(target, account, "passed")
      } catch (error) {
        await shot(page, target, account, "failure")
        results.push({
          target,
          account,
          status: "failed",
          message: String(error),
          stack: error.stack,
          checks,
          errors,
          failures,
          consoleErrors,
        })
        console.log(target, account, String(error), errors, failures, consoleErrors)
      } finally {
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(
    new URL("reviews/queue-dashboard-browser-development.json", output),
    JSON.stringify(results, null, 2) + "\n",
  )
}
if (results.some((result) => result.status === "failed")) process.exitCode = 1
