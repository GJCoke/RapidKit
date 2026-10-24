import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { instrumentFixtures } from "./instrument-fixtures.mjs"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/socket-instrument/", output)
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
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
        page = await context.newPage(),
        main = page.locator("main"),
        fixture = instrumentFixtures(),
        s = fixture.state,
        checks = [],
        errors = [],
        failures = [],
        consoleErrors = []
      page.setDefaultTimeout(15000)
      function monitor(tab) {
        tab.on("pageerror", (e) => errors.push(e.message))
        tab.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text())
        })
        tab.on("requestfailed", (r) => {
          if (r.failure()?.errorText !== "net::ERR_ABORTED")
            failures.push({ url: r.url(), error: r.failure()?.errorText })
        })
      }
      monitor(page)
      await page.routeWebSocket(/\/socket\.io\//, fixture.handler)
      await page.addInitScript(() => {
        window.__instrumentClipboard = []
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async (value) => window.__instrumentClipboard.push(value) },
        })
      })
      await page.clock.install({ time: new Date() })
      const checkpoint = (text) => {
        checks.push(text)
        console.log(target, account, checks.length, text)
      }
      const shot = (scene) =>
        page.screenshot({
          path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
          fullPage: true,
          animations: "disabled",
        })
      const connection = () => (admin ? main.locator('[data-slot="card"]').first() : main.locator(".n-card").first())
      const authField = (kind) =>
        admin
          ? page.getByLabel(kind === "username" ? "用户名" : "密码", { exact: true })
          : connection().getByPlaceholder(kind === "username" ? "请输入用户名" : "请输入密码", { exact: true })
      async function advanced() {
        if (!(await authField("username").isVisible())) {
          if (admin) await connection().getByRole("button", { name: "高级配置", exact: true }).click()
          else await connection().getByRole("button").last().click()
          await authField("username").waitFor()
        }
      }
      const connect = () => connection().getByRole("button", { name: "连接", exact: true }).click(),
        disconnect = () => connection().getByRole("button", { name: "断开", exact: true }).click()
      const card = (title) =>
        admin
          ? main
              .locator('[data-slot="card"]')
              .filter({ has: page.getByText(title, { exact: true }) })
              .first()
          : main
              .locator(".n-card")
              .filter({ has: page.getByText(title, { exact: true }) })
              .first()
      async function history() {
        if (admin) await main.getByRole("button", { name: "连接记录", exact: true }).click()
        else await card("客户端分布").getByRole("button").click()
        return admin
          ? page.getByRole("dialog", { name: "Socket 连接历史", exact: true })
          : page
              .locator(".n-drawer-content")
              .filter({ has: page.getByText("Socket 连接历史", { exact: true }) })
              .filter({ visible: true })
      }
      async function closeSheet(sheet) {
        if (admin) await sheet.getByRole("button", { name: "关闭", exact: true }).click()
        else await sheet.locator(".n-base-close").click()
        await sheet.waitFor({ state: "hidden" })
      }
      async function clientCard(sheet, sid) {
        return admin
          ? sheet
              .locator('[data-slot="card"]')
              .filter({ has: page.getByRole("button", { name: `查看客户端 ${sid}`, exact: true }) })
          : sheet.locator(".n-card").filter({ has: page.getByText(sid, { exact: true }) })
      }
      function clientLabel(sheet, sid, english = false) {
        return admin
          ? sheet.getByRole("button", { name: english ? `View client ${sid}` : `查看客户端 ${sid}`, exact: true })
          : sheet.locator("span.text-primary.font-mono").filter({ hasText: new RegExp(`^${sid}$`) })
      }
      async function kick(sheet, sid, cancel) {
        const item = await clientCard(sheet, sid)
        if (admin) await item.getByRole("button", { name: `断开客户端 ${sid}`, exact: true }).click()
        else await item.getByRole("button").click()
        const dialog = admin ? page.getByRole("alertdialog") : page.locator(".n-dialog").filter({ visible: true })
        await dialog.getByRole("button", { name: cancel ? "取消" : "断开", exact: true }).click()
        await dialog.waitFor({ state: "hidden" })
      }
      try {
        const login = await context.newPage()
        login.setDefaultTimeout(15000)
        monitor(login)
        await login.goto(`${origin}/login`)
        await login.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await login.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await login.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await login.waitForURL((u) => !u.pathname.startsWith("/login"))
        await login.close()
        await page.goto(`${origin}/socketio/instrument`)
        await main.getByText("暂无命名空间", { exact: true }).waitFor()
        await shot("empty-zh-light")
        await advanced()
        if (admin)
          await connection()
            .getByRole("textbox", { name: "URL", exact: true })
            .fill("http://localhost:16000/ignored?tenant=one")
        await authField("username").fill(process.env.SOCKETIO_TEST_USERNAME || "admin")
        await authField("password").fill(process.env.SOCKETIO_TEST_PASSWORD || "123456")
        s.failNext = true
        await connect()
        await page
          .getByText(/fixture authentication failed/)
          .last()
          .waitFor()
        await shot("auth-error")
        let release
        s.gate = new Promise((resolve) => {
          release = resolve
        })
        await connect()
        try {
          if (admin) await connection().getByText("连接中…", { exact: true }).first().waitFor()
          else await connection().locator(".n-button--loading").waitFor()
          await shot("connecting")
        } finally {
          release()
          s.gate = null
        }
        await connection().getByRole("button", { name: "断开", exact: true }).waitFor()
        await until(() => s.handshakes === 1)
        if (admin) assert.equal(s.connections.find((c) => c.instrument)?.tenant, "one")
        await main.getByText(admin ? "host-alpha" : "Host: host-alpha", { exact: true }).waitFor()
        await until(async () => !(await authField("username").isVisible()))
        await shot("overview-zh-light")
        const overview = card("客户端分布")
        await until(async () => /8/.test(await overview.innerText()))
        assert.match(await overview.innerText(), /8/)
        assert.match(await overview.innerText(), /7/)
        assert.match(await overview.innerText(), /1/)
        checkpoint(
          "empty/offline, advanced credentials, auth refusal and loading state; real /admin authenticated handshake with isolated deterministic multi-server metrics",
        )
        let sheet = await history()
        await sheet.waitFor()
        await clientLabel(sheet, "client-chat").waitFor()
        const item = await clientCard(sheet, "client-chat")
        if (admin) await item.getByRole("button", { name: "查看客户端 client-chat", exact: true }).click()
        else await item.click()
        const detail = admin
          ? page.getByRole("dialog", { name: "客户端详情", exact: true })
          : page
              .locator(".n-modal")
              .filter({ has: page.getByText("客户端详情", { exact: true }) })
              .filter({ visible: true })
        await detail.getByText("engine-client-chat", { exact: true }).waitFor()
        await detail.getByText("room7", { exact: true }).waitFor()
        await detail.getByText("header-value", { exact: true }).waitFor()
        if (admin) await detail.getByRole("tab", { name: "查询参数", exact: true }).click()
        else await detail.locator(".n-tabs-tab").filter({ hasText: "查询参数" }).click()
        await detail.getByText(/"tag"/).waitFor()
        assert.match(await detail.innerText(), /"two"/)
        if (admin) {
          await detail.getByRole("button", { name: "复制 Socket ID", exact: true }).click()
          assert.deepEqual(await page.evaluate(() => window.__instrumentClipboard), ["client-chat"])
        } else assert.equal(await detail.locator("[copyable]").count(), 1)
        await shot("client-detail")
        if (admin) await detail.getByRole("button", { name: "关闭", exact: true }).click()
        else await detail.locator(".n-card-header__close").click()
        await detail.waitFor({ state: "hidden" })
        const before = s.kicks.length
        await kick(sheet, "client-root", true)
        assert.equal(s.kicks.length, before)
        await kick(sheet, "client-root", false)
        await until(() => s.kicks.length === before + 1)
        assert.deepEqual(s.kicks.at(-1), { nsp: "/", close: true, sid: "client-root" })
        await until(async () => (await sheet.getByText("client-root", { exact: true }).count()) === 0)
        await kick(sheet, "client-chat", false)
        assert.deepEqual(s.kicks.at(-1), { nsp: admin ? "/chat" : "/", close: true, sid: "client-chat" })
        if (admin) await until(async () => (await sheet.getByText("client-chat", { exact: true }).count()) === 0)
        await closeSheet(sheet)
        checkpoint(
          "client history and handshake metadata, all rooms, headers/repeated queries and target copy request; cancel/confirm intercepted disconnect commands with exact namespace",
        )
        const changed = fixture.client("live-client", "/chat", "polling")
        s.clients.push(changed)
        fixture.broadcast("socket_connected", changed, new Date().toISOString())
        fixture.broadcast("all_sockets", s.clients)
        if (admin) await main.getByRole("button", { name: "查看 /chat 中的客户端", exact: true }).click()
        else await card("命名空间").getByText("/chat", { exact: true }).click()
        sheet = admin
          ? page.getByRole("dialog", { name: "/chat 命名空间中的客户端", exact: true })
          : page
              .locator(".n-drawer-content")
              .filter({ has: page.getByText("/chat 命名空间中的客户端", { exact: true }) })
              .filter({ visible: true })
        await clientLabel(sheet, "live-client").waitFor()
        assert.equal(await sheet.getByText("client-root", { exact: true }).count(), 0)
        await shot("namespace-clients")
        await closeSheet(sheet)
        for (const title of ["连接统计", "网络流量 (最近 10 分钟)"]) {
          const chart = admin ? main.getByRole("figure", { name: title, exact: true }) : card(title)
          await chart.scrollIntoViewIfNeeded()
          if (admin)
            assert(
              await chart.locator(".recharts-bar-rectangle path").evaluateAll((paths) =>
                paths.some((p) => {
                  const b = p.getBBox()
                  return b.width > 1 && b.height > 1
                }),
              ),
            )
          else
            assert(
              await chart.locator("canvas").evaluateAll((canvases) =>
                canvases.some((canvas) => {
                  const c = canvas.getContext("2d"),
                    pixels = c.getImageData(0, 0, canvas.width, canvas.height).data
                  let green = 0
                  for (let i = 0; i < pixels.length; i += 4)
                    if (
                      Math.abs(pixels[i] - 24) < 3 &&
                      Math.abs(pixels[i + 1] - 160) < 3 &&
                      Math.abs(pixels[i + 2] - 88) < 3
                    )
                      green++
                  return green > 10
                }),
              ),
            )
        }
        await shot("charts-live")
        checkpoint(
          "live client upsert/snapshot and namespace filtering; connection/byte traffic charts contain actual plotted bars",
        )
        await page.clock.fastForward(11000)
        if (admin) {
          await main.getByRole("button", { name: "移除服务器 host-beta", exact: true }).click()
        } else {
          const item = card("服务器信息").getByText("Host: host-beta", { exact: true }).locator("../../..")
          await item.hover()
          await item.locator(".absolute").click()
        }
        await until(
          async () => (await main.getByText(admin ? "host-beta" : "Host: host-beta", { exact: true }).count()) === 0,
        )
        await until(async () => /3/.test(await overview.innerText()))
        assert.match(await overview.innerText(), /3/)
        await shot("offline-server-removed")
        for (let index = 0; index < 105; index++)
          fixture.broadcast(
            index % 2 ? "event_sent" : "event_received",
            "/chat",
            "live-client",
            [`stream-${index}`, { index }],
            new Date().toISOString(),
          )
        const logs = card("事件消息（接收/发送）")
        await logs.getByText("stream-104", { exact: true }).waitFor()
        assert.equal(await logs.getByText("stream-0", { exact: true }).count(), 0)
        assert.match(await logs.innerText(), /100/)
        await logs.scrollIntoViewIfNeeded()
        await shot("message-window")
        checkpoint(
          "ten-second server liveness and local removal adjust aggregated totals; 105 received/sent events retain the newest 100",
        )
        const live = s.connections.findLast((c) => c.instrument && !c.closed),
          handshakes = s.handshakes
        live.socket.close({ code: 1000, reason: "parity reconnect" })
        live.server.close({ code: 1000 })
        live.closed = true
        await until(() => s.handshakes > handshakes)
        await main.getByText(admin ? "host-alpha" : "Host: host-alpha", { exact: true }).waitFor()
        await disconnect()
        await main.getByText("暂无命名空间", { exact: true }).waitFor()
        if (admin) await main.getByText("暂无消息捕获", { exact: true }).waitFor()
        await shot("manual-disconnect")
        await connect()
        await until(() => s.handshakes === handshakes + 2)
        await main.getByText(admin ? "host-alpha" : "Host: host-alpha", { exact: true }).waitFor()
        if (admin) {
          let releaseCancel
          s.gate = new Promise((resolve) => {
            releaseCancel = resolve
          })
          const accepted = s.handshakes,
            previous = s.connections.findLast((c) => c.instrument && !c.closed)
          previous.socket.close({ code: 1000, reason: "cancel pending reconnect" })
          previous.server.close({ code: 1000 })
          previous.closed = true
          let pending
          try {
            await until(() => {
              pending = s.connections.findLast((c) => c.requestedAdmin && !c.instrument && !c.closed)
              return Boolean(pending)
            })
            await connection().getByText("离线", { exact: true }).waitFor()
            await connection().getByRole("button", { name: "断开", exact: true }).waitFor()
            await shot("offline-reconnect-cancellable")
            await disconnect()
            await until(() => pending.closed)
          } finally {
            releaseCancel()
            s.gate = null
          }
          await page.waitForTimeout(1500)
          assert.equal(s.handshakes, accepted, "cancelled retry must not authenticate")
          await main.getByText("暂无命名空间", { exact: true }).waitFor()
          await connect()
          await until(() => s.handshakes === accepted + 1)
          await main.getByText("host-alpha", { exact: true }).waitFor()
          const beforeTransient = s.handshakes,
            recovered = s.connections.findLast((c) => c.instrument && !c.closed)
          s.stallOpening = true
          recovered.socket.close({ code: 1000, reason: "temporary server outage" })
          recovered.server.close({ code: 1000 })
          recovered.closed = true
          await until(() => s.connections.some((c) => c.stalled && !c.closed))
          await page.clock.fastForward(20001)
          await connection().getByText("认证失败：timeout", { exact: true }).waitFor()
          await connection().getByRole("button", { name: "断开", exact: true }).waitFor()
          await shot("transient-reconnect-error")
          await until(() => s.handshakes === beforeTransient + 1)
          await main.getByText("host-alpha", { exact: true }).waitFor()
        }
        checkpoint(
          "transport reconnect reauthenticates, manual disconnect clears telemetry, pending retries are cancellable, and transient handshake failure recovers automatically",
        )
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
        await connection().scrollIntoViewIfNeeded()
        await shot("overview-en-dark-390")
        if (admin) assert(await main.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
        if (admin) await main.getByRole("button", { name: "Connection history", exact: true }).click()
        else await card("Client Distribution").getByRole("button").click()
        sheet = admin
          ? page.getByRole("dialog", { name: "Connected Sockets History", exact: true })
          : page
              .locator(".n-drawer-content")
              .filter({ has: page.getByText("Connected Sockets History", { exact: true }) })
              .filter({ visible: true })
        await clientLabel(sheet, "client-chat", true).waitFor()
        await shot("history-en-dark-390")
        if (admin) {
          const box = await sheet.boundingBox()
          assert(box.x >= 0 && box.x + box.width <= 390 + 1)
          await sheet.getByRole("button", { name: "View client client-chat", exact: true }).click()
          const detail = page.getByRole("dialog", { name: "Client Handshake Detail", exact: true })
          await detail.getByText("room7", { exact: true }).waitFor()
          const bounds = await detail.boundingBox()
          assert(bounds.x >= 0 && bounds.x + bounds.width <= 391)
          assert(await detail.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
          await shot("detail-en-dark-390")
        }
        checkpoint(
          "English translations, dark theme and 390px overview/history/detail without target horizontal overflow",
        )
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        assert.deepEqual(consoleErrors, [])
        results.push({
          target,
          account,
          checks,
          errors,
          failures,
          consoleErrors,
          handshakes: s.handshakes,
          commands: s.kicks,
          realBusinessCommands: 0,
        })
      } catch (e) {
        await shot("failure").catch(() => {})
        results.push({ target, account, error: String(e), checks, errors, failures, consoleErrors })
        console.error(target, account, e)
        process.exitCode = 1
      } finally {
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(new URL("socket-instrument-browser-results.json", output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
