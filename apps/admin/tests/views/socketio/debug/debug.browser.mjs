import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { debugFixtures } from "./debug-fixtures.mjs"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/socket-debug/", output)
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
        fixture = debugFixtures(),
        s = fixture.state,
        checks = [],
        errors = [],
        failures = [],
        consoleErrors = []
      page.setDefaultTimeout(15000)
      page.on("pageerror", (e) => {
        errors.push(e.message)
        console.error("pageerror checkpoint", checks.length, page.url(), e.name, e.stack)
      })
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text())
      })
      page.on("requestfailed", (r) => {
        if (r.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: r.url(), error: r.failure()?.errorText })
      })
      await page.routeWebSocket(/\/parity-debug\//, fixture.handler)
      await page.routeWebSocket(/\/socket\.io\//, (socket) => {
        const server = socket.connectToServer()
        let closed = false
        socket.onMessage((data) => {
          if (!closed) server.send(data)
        })
        server.onMessage((data) => {
          if (!closed) socket.send(data)
        })
        socket.onClose(() => {
          closed = true
          server.close()
        })
        server.onClose((code, reason) => {
          closed = true
          socket.close({ code, reason })
        })
      })
      const shot = (scene) =>
        page.screenshot({
          path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
          fullPage: true,
          animations: "disabled",
        })
      const checkpoint = (text) => {
        checks.push(text)
        console.log(target, account, checks.length, text)
      }
      const card = admin
        ? main
            .locator('[data-slot="card"]')
            .filter({ has: page.getByText("Socket.IO 连接", { exact: true }) })
            .first()
        : main
            .locator(".n-card")
            .filter({ has: page.getByText("Socket.IO 连接", { exact: true }) })
            .first()
      const url = () => (admin ? main.getByRole("textbox", { name: "URL", exact: true }) : card.locator("input").nth(0))
      const path = () =>
        admin ? main.getByRole("textbox", { name: "路径", exact: true }) : card.locator("input").nth(1)
      const nsp = () =>
        admin ? main.getByRole("textbox", { name: "命名空间", exact: true }) : card.locator("input").nth(2)
      const auth = () =>
        admin ? main.getByRole("textbox", { name: "身份认证（JSON）", exact: true }) : card.locator("textarea")
      async function advanced() {
        if (!(await auth().isVisible())) {
          if (admin) await card.getByRole("button", { name: "高级配置", exact: true }).click()
          else await card.getByRole("button").last().click()
          await auth().waitFor()
        }
      }
      const connect = () => card.getByRole("button", { name: "连接", exact: true }).click()
      const disconnect = () => card.getByRole("button", { name: "断开", exact: true }).click()
      const event = () =>
        admin
          ? main.getByRole("textbox", { name: "事件名称", exact: true })
          : main.locator('input[placeholder="例如: message"]')
      const data = () =>
        admin
          ? main.getByRole("textbox", { name: "数据 (JSON)", exact: true })
          : main.locator('textarea[placeholder="请输入要发送的数据"]')
      const send = () => main.getByRole("button", { name: "发送事件", exact: true }).click()
      try {
        const loginPage = await context.newPage()
        loginPage.setDefaultTimeout(15000)
        loginPage.on("pageerror", (e) => errors.push(e.message))
        loginPage.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text())
        })
        loginPage.on("requestfailed", (r) => {
          if (r.failure()?.errorText !== "net::ERR_ABORTED")
            failures.push({ url: r.url(), error: r.failure()?.errorText })
        })
        await loginPage.goto(`${origin}/login`)
        await loginPage.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await loginPage.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await loginPage.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await loginPage.waitForURL((u) => !u.pathname.startsWith("/login"))
        await loginPage.close()
        await page.goto(`${origin}/socketio/debug`)
        await main.getByText("暂无消息", { exact: true }).waitFor()
        assert(await main.getByRole("button", { name: "发送事件", exact: true }).isDisabled())
        await shot("empty-zh-light")
        await advanced()
        assert.equal(await path().inputValue(), "/socket.io")
        assert.equal(await nsp().inputValue(), "/")
        await url().fill(admin ? "http://debug.example.test/ignored?tenant=alpha" : "http://debug.example.test")
        await path().fill("/parity-debug")
        await nsp().fill("/custom-room")
        await auth().fill("{")
        await connect()
        await page
          .getByText(admin ? "身份认证必须是 JSON 对象" : "无效的 JSON 数据", { exact: true })
          .last()
          .waitFor()
        assert.equal(s.connections.length, 0)
        checkpoint(
          "initial empty/offline state, editable URL/path/namespace/auth and malformed auth blocked without opening transport",
        )
        await auth().fill('{"apiKey":"fixture-only"}')
        let release
        s.gate = new Promise((resolve) => {
          release = resolve
        })
        await connect()
        try {
          await until(() => s.connections.length === 1)
          if (admin) {
            await card.getByText("连接中…", { exact: true }).first().waitFor()
            assert(await main.getByRole("button", { name: "发送事件", exact: true }).isDisabled())
          }
          await shot("connecting-zh-light")
        } finally {
          release()
          s.gate = null
        }
        await card.getByRole("button", { name: "断开", exact: true }).waitFor()
        await until(() => s.connections[0].online)
        assert.equal(s.connections[0].url, "ws://debug.example.test")
        assert.equal(s.connections[0].path, "/parity-debug/")
        if (admin) assert.equal(s.connections[0].query.tenant, "alpha")
        assert.deepEqual(s.connections[0].authKeys, ["apiKey"])
        await until(async () => !(await auth().isVisible()))
        await data().fill("bad json")
        await send()
        await page.getByText("无效的 JSON 数据", { exact: true }).last().waitFor()
        assert.equal(s.sent.length, 0)
        assert.equal(await data().inputValue(), "bad json")
        await event().fill("custom:echo")
        for (const [text, value] of [
          ['{"value":1}', { value: 1 }],
          ["[0,false,null]", [0, false, null]],
          ["null", null],
          ["false", false],
          ["0", 0],
          ['"literal <script>"', "literal <script>"],
        ]) {
          const count = s.sent.length
          await data().fill(text)
          await send()
          await until(() => s.sent.length === count + 1)
          assert.deepEqual(s.sent.at(-1), { event: "custom:echo", payload: value })
        }
        fixture.receive("multi", { one: 1 }, false, "third")
        await main.getByText("multi", { exact: true }).waitFor()
        await main
          .getByText(/"third"/)
          .last()
          .waitFor()
        if (admin) {
          await main.getByText("null", { exact: true }).last().waitFor()
          await main.getByText("0", { exact: true }).last().waitFor()
        }
        await shot("send-receive-zh-light")
        checkpoint(
          "custom endpoint/path/namespace connects with only explicit auth; malformed send retains draft, all six JSON kinds echo and multi-argument payload is logged",
        )
        const first = s.connections[0]
        await disconnect()
        await until(() => first.closed)
        assert(await main.getByRole("button", { name: "发送事件", exact: true }).isDisabled())
        s.failNext = true
        await connect()
        await main
          .getByText(/fixture refused/)
          .last()
          .waitFor()
        await shot("connection-error")
        await connect()
        await card.getByRole("button", { name: "断开", exact: true }).waitFor()
        fixture.receive("after-retry", "retry received")
        await main.getByText("retry received", { exact: true }).last().waitFor()
        if (admin) assert(s.connections[1].closed, "failed transport released before manual retry")
        checkpoint(
          "manual disconnect disables sends; connection refusal logs error and retry creates a working connection with old target transport released",
        )
        const live = s.connections.at(-1),
          before = s.connections.length
        live.socket.close({ code: 1000, reason: "parity reconnect" })
        await until(() => s.connections.length > before)
        await card.getByRole("button", { name: "断开", exact: true }).waitFor()
        fixture.receive("after-reconnect", "reconnected payload")
        await main.getByText("reconnected payload", { exact: true }).last().waitFor()
        if (admin) {
          const active = s.connections.at(-1)
          let releaseCancel
          s.gate = new Promise((resolve) => {
            releaseCancel = resolve
          })
          active.socket.close({ code: 1000, reason: "cancel pending retry" })
          let pending
          try {
            await until(() => {
              pending = s.connections.findLast((c) => c.requested && !c.online && !c.closed)
              return Boolean(pending)
            })
            await card.getByText("离线", { exact: true }).waitFor()
            await card.getByRole("button", { name: "断开", exact: true }).waitFor()
            await shot("offline-reconnect-cancellable")
            await disconnect()
            await until(() => pending.closed)
          } finally {
            releaseCancel()
            s.gate = null
          }
          const countAfterCancel = s.connections.length
          await page.waitForTimeout(1500)
          assert.equal(s.connections.length, countAfterCancel, "explicit cancellation must stop automatic retries")
          assert.equal(pending.online, false)
          await connect()
          await until(() => s.connections.at(-1).online)
          fixture.receive("after-cancel", "manual recovery")
          await main.getByText("manual recovery", { exact: true }).last().waitFor()
        }
        await shot("reconnected")
        await main.getByRole("button", { name: "清空", exact: true }).click()
        await main.getByText("暂无消息", { exact: true }).waitFor()
        await disconnect()
        checkpoint(
          "actual transport closure reconnects and receives events; clearing removes the accumulated event history",
        )
        await advanced()
        await url().fill("http://localhost:16000")
        await path().fill("/socket.io")
        await nsp().fill("/")
        const token = await page.evaluate((target) => {
          if (target === "admin") return localStorage.getItem("accessToken")
          const raw = localStorage.getItem("RAPIDKIT_token")
          try {
            return JSON.parse(raw)?.value ?? JSON.parse(raw)
          } catch {
            return raw
          }
        }, target)
        assert.equal(typeof token, "string")
        assert(token.length > 20)
        await auth().fill(JSON.stringify({ accessToken: token }))
        await connect()
        await main
          .getByText(/unauthorized/)
          .last()
          .waitFor()
        await advanced()
        await auth().fill(JSON.stringify({ access_token: token }))
        await connect()
        await card.getByRole("button", { name: "断开", exact: true }).waitFor()
        await main
          .getByText(admin ? /已连接（ID：/ : /Connected \(ID:/)
          .last()
          .waitFor()
        await shot("real-authenticated-connection")
        await disconnect()
        checkpoint(
          "real backend rejects source-style accessToken and accepts access_token; authenticated root connection closes without any business emit",
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
        await main.getByText("Socket.IO Connection", { exact: true }).scrollIntoViewIfNeeded()
        await shot("connection-en-dark-390")
        await main.getByRole("button", { name: "Send Event", exact: true }).scrollIntoViewIfNeeded()
        await shot("emit-logs-en-dark-390")
        if (admin) {
          assert(await main.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
          await main
            .getByText(/Disconnected:/)
            .last()
            .waitFor()
        }
        checkpoint(
          "English status and log templates, dark theme and 390px connection/send/log sections with no target page overflow",
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
          customConnections: s.connections.length,
          sent: s.sent,
          realBusinessEmits: 0,
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
  await writeFile(new URL("socket-debug-browser-results.json", output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
