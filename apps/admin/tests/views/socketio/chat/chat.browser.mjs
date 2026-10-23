import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { chatFixtures } from "./chat-fixtures.mjs"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/socket-chat/", output)
await mkdir(shots, { recursive: true })
const customAvatar = `data:image/jpeg;base64,${(await readFile(new URL("../../../../public/images/chat/avatar_suneo.jpg", import.meta.url))).toString("base64")}`
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true }),
  results = []
async function until(check) {
  const deadline = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < deadline, "condition must settle")
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
const names = { Doraemon: "哆啦A梦", Nobita: "野比大雄", Shizuka: "源静香", Gian: "刚田武", Suneo: "骨川小夫" },
  rooms = {
    "Nobis-Home": "大雄的家",
    "Secret-Base": "后山秘密基地",
    School: "月见台小学",
    "Doraemon-Fans": "哆啦A梦粉丝团",
  }
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
        page = await context.newPage(),
        admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        fixture = chatFixtures(),
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
      await page.routeWebSocket(/\/socket\.io\//, fixture.handler)
      const checkpoint = (text) => {
        checks.push(text)
        console.log(target, account, checks.length, text)
      }
      const windowFor = (character, group = "Nobis-Home") =>
        admin
          ? main.getByRole("region", { name: `${names[character]} · ${rooms[group]}`, exact: true })
          : main
              .locator(".n-card")
              .filter({ has: page.locator(".n-card-header").getByText(names[character], { exact: true }) })
              .filter({ has: page.locator(".n-card-header").getByText(rooms[group], { exact: true }) })
      const characterButton = (character) =>
        admin
          ? main.getByRole("button", { name: `加入 ${names[character]}`, exact: true })
          : main
              .locator(".n-avatar")
              .filter({ has: page.locator(`img[src*="avatar_${character.toLowerCase()}"]`) })
              .first()
              .locator("..")
      async function chooseRoom(group) {
        if (admin) {
          await main.getByRole("combobox", { name: "目标房间", exact: true }).click()
          for (const label of Object.values(rooms))
            await page.getByRole("option", { name: label, exact: true }).waitFor()
          await page.getByRole("option", { name: rooms[group], exact: true }).click()
        } else {
          await main.locator(".n-select").click()
          for (const label of Object.values(rooms))
            await page.locator(".n-base-select-option").filter({ hasText: label }).filter({ visible: true }).waitFor()
          await page
            .locator(".n-base-select-option")
            .filter({ hasText: rooms[group] })
            .filter({ visible: true })
            .click()
        }
      }
      async function join(character, group = "Nobis-Home", cancel = false, online = true) {
        if (!admin)
          await until(async () => (await page.locator(".n-popconfirm").filter({ visible: true }).count()) === 0)
        await characterButton(character).click()
        const confirm = admin ? page.getByRole("alertdialog") : page.locator(".n-popconfirm").filter({ visible: true })
        await confirm.getByRole("button", { name: cancel ? "取消" : "确认", exact: true }).click()
        if (!admin)
          await until(async () => (await page.locator(".n-popconfirm").filter({ visible: true }).count()) === 0)
        if (!cancel) {
          await windowFor(character, group).waitFor()
          if (online) await windowFor(character, group).getByText("在线", { exact: true }).waitFor()
        }
      }
      async function close(character, group = "Nobis-Home") {
        const window = windowFor(character, group)
        if (admin) await window.getByRole("button", { name: /^关闭 / }).click()
        else await window.locator(".n-card-header__close").click()
        await window.waitFor({ state: "detached" })
      }
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        await page.goto(`${origin}/socketio/chat`)
        await main.getByText("点击上方角色头像加入对话", { exact: true }).waitFor()
        await shot(page, target, account, "empty-zh-light")
        await join("Doraemon", "Nobis-Home", true)
        assert.equal(s.handshakes, 0)
        let releaseConnect
        s.connectGate = new Promise((resolve) => {
          releaseConnect = resolve
        })
        await join("Doraemon", "Nobis-Home", false, false)
        try {
          await windowFor("Doraemon")
            .getByText(admin ? "连接中…" : "离线", { exact: true })
            .waitFor()
          await shot(page, target, account, "connecting-zh-light")
          assert.equal(s.handshakes, 0)
        } finally {
          releaseConnect()
          s.connectGate = null
        }
        await windowFor("Doraemon").getByText("在线", { exact: true }).waitFor()
        await until(() => s.handshakes === 1)
        await windowFor("Doraemon").getByText("用户 哆啦A梦 已加入群组 大雄的家", { exact: true }).waitFor()
        const first = s.connections.find((c) => c.username === "Doraemon" && c.group === "Nobis-Home")
        assert(first)
        checkpoint(
          "empty state and cancelled join; real token/character namespace handshake with intercepted room join and translated system message",
        )
        const before = s.handshakes
        await join("Doraemon")
        await page
          .getByText(admin ? '哆啦A梦 已经在 "大雄的家" 房间中了' : 'Doraemon 已经在 "Nobis-Home" 房间中了', {
            exact: true,
          })
          .last()
          .waitFor()
        assert.equal(s.handshakes, before)
        await join("Nobita")
        const input = windowFor("Doraemon").getByRole("textbox")
        await input.fill("  parity room message  ")
        await input.press("Enter")
        await until(() =>
          s.sent.some(
            (message) =>
              message.content === "  parity room message  " &&
              message.sender === "Doraemon" &&
              message.group === "Nobis-Home",
          ),
        )
        for (const character of ["Doraemon", "Nobita"])
          await windowFor(character).getByText("parity room message", { exact: false }).waitFor()
        assert.equal(await input.inputValue(), "")
        fixture.packet(first, {
          id: "custom-avatar-packet",
          sender: "Doraemon",
          time: "12:30:00",
          type: "text",
          content: "custom-avatar",
          avatar: customAvatar,
        })
        const customMessage = windowFor("Doraemon").getByText("custom-avatar", { exact: true })
        await customMessage.waitFor()
        const avatarRow = admin
          ? windowFor("Doraemon").locator('[data-slot="message"]').filter({ hasText: "custom-avatar" })
          : customMessage.locator("../..")
        assert(
          (await avatarRow.locator("img").getAttribute("src")) === customAvatar,
          "message avatar overrides the character default",
        )
        const count = s.sent.length
        await input.fill("    ")
        await input.press("Enter")
        assert.equal(s.sent.length, count)
        await chooseRoom("School")
        await join("Doraemon", "School")
        await windowFor("Doraemon", "School").getByRole("textbox").fill("other room only")
        await windowFor("Doraemon", "School").getByRole("textbox").press("Enter")
        await windowFor("Doraemon", "School").getByText("other room only", { exact: true }).waitFor()
        assert.equal(await windowFor("Doraemon").getByText("other room only", { exact: true }).count(), 0)
        await chooseRoom("Nobis-Home")
        await join("Shizuka")
        await main.getByText("活跃实例: 4 / 4", { exact: true }).waitFor()
        if (admin) for (const character of Object.keys(names)) assert(await characterButton(character).isDisabled())
        else
          assert(
            await characterButton("Suneo")
              .locator("..")
              .evaluate((element) => getComputedStyle(element).pointerEvents === "none"),
          )
        await shot(page, target, account, "four-windows-chat")
        checkpoint(
          "duplicate identity blocked, whitespace ignored, exact original text echoed to same room only, same character in another room and four-window limit",
        )
        await close("Shizuka")
        await windowFor("Doraemon").getByText("用户 源静香 已离开群组 大雄的家", { exact: true }).waitFor()
        await join("Gian")
        await close("Gian")
        s.failNext = true
        await join("Suneo", "Nobis-Home", false, false)
        await windowFor("Suneo")
          .getByText(admin ? "连接失败：fixture connection unavailable" : "离线", { exact: true })
          .waitFor()
        await shot(page, target, account, "connection-error")
        if (admin) await windowFor("Suneo").getByRole("button", { name: "重新连接", exact: true }).click()
        else {
          await close("Suneo")
          await join("Suneo")
        }
        await windowFor("Suneo").getByText("在线", { exact: true }).waitFor()
        await close("Suneo")
        checkpoint("close releases ownership and announces leave; connection refusal with retry or source close/reopen")
        for (let index = 1; index <= 45; index++)
          fixture.broadcast("Nobis-Home", `history-${index} ${"readable words ".repeat(10)}`)
        await windowFor("Doraemon")
          .getByText(/^history-45 /)
          .waitFor()
        const viewport = admin
          ? windowFor("Doraemon").locator('[data-slot="message-scroller-viewport"]')
          : windowFor("Doraemon").locator(".n-scrollbar-container")
        await until(() =>
          viewport.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop < 50),
        )
        assert(await viewport.evaluate((element) => element.scrollHeight > element.clientHeight * 2))
        if (admin) {
          await viewport.hover()
          await page.mouse.wheel(0, -1200)
          await until(() =>
            viewport.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop > 300),
          )
          let previousTop = -1,
            stableSamples = 0
          await until(async () => {
            const current = await viewport.evaluate((element) => element.scrollTop)
            stableSamples = Math.abs(current - previousTop) < 1 ? stableSamples + 1 : 0
            previousTop = current
            return stableSamples >= 5
          })
          const old = await viewport.evaluate((element) => element.scrollTop)
          fixture.broadcast("Nobis-Home", "while reading history")
          await windowFor("Doraemon").getByText("while reading history", { exact: true }).waitFor({ state: "attached" })
          await page.waitForTimeout(200)
          assert(Math.abs((await viewport.evaluate((element) => element.scrollTop)) - old) < 30)
          await windowFor("Doraemon").getByRole("button", { name: "最新消息", exact: true }).click()
          await until(() =>
            viewport.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop < 50),
          )
        }
        await shot(page, target, account, "message-history")
        checkpoint(
          "message history timestamps, actual bounded thread overflow, automatic following; target reading position and jump to latest",
        )
        const reconnectBefore = s.handshakes
        first.socket.close({ code: 1000, reason: "parity reconnect" })
        first.server.close({ code: 1000 })
        first.closed = true
        await until(() => s.handshakes > reconnectBefore)
        await windowFor("Doraemon").getByText("在线", { exact: true }).waitFor()
        fixture.broadcast("Nobis-Home", "after reconnect")
        await windowFor("Doraemon").getByText("after reconnect", { exact: true }).waitFor()
        checkpoint("actual transport reconnect performs a new real authenticated handshake and rejoins room")
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
        await main.getByText("Select Character", { exact: true }).scrollIntoViewIfNeeded()
        await shot(page, target, account, "selector-en-dark-390")
        const englishWindow = admin
          ? main.getByRole("region", { name: "Doraemon · Nobi's Home", exact: true })
          : main
              .locator(".n-card")
              .filter({ has: page.locator(".n-card-header").getByText("Doraemon", { exact: true }) })
              .filter({ has: page.locator(".n-card-header").getByText("Nobi's Home", { exact: true }) })
        await englishWindow.scrollIntoViewIfNeeded()
        await shot(page, target, account, "conversation-en-dark-390")
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        checkpoint(
          "English live system-message translations, dark theme and 390px selector/conversation without target page overflow",
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
          messages: s.sent,
          realRoomWrites: 0,
        })
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
  await writeFile(new URL("socket-chat-browser-results.json", output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
