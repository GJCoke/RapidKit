import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/preferences/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
  }),
  results = []
const pattern = /\/(?:api\/v1|proxy-default)\/notification-preferences(?:\/[^/?]+)?(?:\?|$)/
const initial = [
  {
    category: "user.mention",
    nameKey: "notification.category.userMention",
    enabled: true,
    closable: true,
    reserved: false,
  },
  {
    category: "task.completed",
    nameKey: "notification.category.taskCompleted",
    enabled: true,
    closable: true,
    reserved: false,
  },
  {
    category: "system.security",
    nameKey: "notification.category.systemSecurity",
    enabled: true,
    closable: false,
    reserved: false,
  },
  {
    category: "user.invited",
    nameKey: "notification.category.userInvited",
    enabled: true,
    closable: true,
    reserved: true,
  },
]
async function until(check) {
  const end = Date.now() + 15000
  while (!check()) {
    assert(Date.now() < end, "fixture request must arrive")
    await new Promise((r) => setTimeout(r, 20))
  }
}
async function shot(page, target, account, scene) {
  await page.mouse.move(1, 1)
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    )
  })
  await page.screenshot({
    path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
    fullPage: true,
    animations: "disabled",
  })
}
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
        page = await context.newPage(),
        admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        path = "/notification/preferences",
        errors = [],
        failures = [],
        consoleErrors = [],
        checks = []
      page.setDefaultTimeout(15000)
      page.on("pageerror", (e) => errors.push(e.message))
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text())
      })
      page.on("requestfailed", (r) => {
        if (r.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: r.url(), error: r.failure()?.errorText })
      })
      const checkpoint = (text) => {
          checks.push(text)
          console.log(target, account, "checkpoint", checks.length, text)
        },
        main = page.locator("main"),
        toggle = (name) => main.getByRole("switch", { name, exact: true })
      let rows = structuredClone(initial),
        failRead = false,
        readGate = null,
        writeGate = null,
        secondWriteGate = null,
        reads = 0,
        failWrite = false
      const puts = []
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        const real = page.waitForResponse((r) => pattern.test(r.url()) && r.request().method() === "GET")
        await page.goto(`${origin}${path}`)
        assert((await real).ok())
        await main.getByText("通知偏好", { exact: true }).first().waitFor()
        checkpoint("real authenticated preferences read works for this account")
        await page.route(pattern, async (route) => {
          if (route.request().method() === "GET") {
            reads++
            const snapshot = structuredClone(rows)
            if (readGate) await readGate
            await route.fulfill({
              json: failRead
                ? { code: 422, message: "Preference list failed", data: null }
                : { code: 0, data: snapshot },
            })
            return
          }
          assert.equal(route.request().method(), "PUT")
          const category = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()),
            body = route.request().postDataJSON()
          puts.push({ category, body })
          assert.deepEqual(Object.keys(body), ["enabled"])
          assert.equal(typeof body.enabled, "boolean")
          const row = rows.find((i) => i.category === category)
          assert(row && row.closable && !row.reserved)
          if (category === "user.mention" && writeGate) await writeGate
          if (category === "task.completed" && secondWriteGate) await secondWriteGate
          if (category === "user.mention" && failWrite) {
            await route.fulfill({ json: { code: 422, message: "Preference save failed", data: null } })
            return
          }
          row.enabled = body.enabled
          await route.fulfill({ json: { code: 0, data: row } })
        })
        await page.reload()
        await toggle("提及我的消息").waitFor()
        assert.equal(await toggle("系统安全").getAttribute("aria-checked"), "true")
        assert.equal(await toggle("用户邀请").getAttribute("aria-checked"), "true")
        if (admin) {
          assert(await toggle("系统安全").isDisabled())
          assert(await toggle("用户邀请").isDisabled())
        } else {
          assert(await toggle("系统安全").evaluate((e) => e.classList.contains("n-switch--disabled")))
          assert(await toggle("用户邀请").evaluate((e) => e.classList.contains("n-switch--disabled")))
        }
        assert.equal(await main.getByText("该分类为强制或保留通知，不可关闭", { exact: true }).count(), 2)
        assert.equal(puts.length, 0)
        await shot(page, target, account, "list")
        checkpoint("translated categories, mandatory/reserved hints and disabled switches match")
        let release
        writeGate = new Promise((r) => {
          release = r
        })
        failWrite = true
        await toggle("提及我的消息").click()
        await until(() => puts.length === 1)
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('[role="switch"]')]
              .find((e) => e.getAttribute("aria-label") === "提及我的消息")
              ?.getAttribute("aria-checked") === "false",
        )
        assert.equal(await toggle("提及我的消息").getAttribute("aria-checked"), "false")
        if (admin) {
          assert(await toggle("提及我的消息").isDisabled())
          assert.equal(await toggle("提及我的消息").getAttribute("aria-busy"), "true")
        } else {
          assert(await toggle("提及我的消息").evaluate((e) => e.classList.contains("n-switch--loading")))
          await toggle("提及我的消息").click()
        }
        await toggle("任务完成").click()
        await until(() => puts.length === 2)
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('[role="switch"]')]
              .find((e) => e.getAttribute("aria-label") === "任务完成")
              ?.getAttribute("aria-checked") === "false",
        )
        assert.deepEqual(
          puts.map((i) => i.category),
          ["user.mention", "task.completed"],
        )
        await shot(page, target, account, "independent-saving")
        const failed = page.waitForResponse(
          (r) => pattern.test(r.url()) && r.request().method() === "PUT" && r.url().includes("user.mention"),
        )
        release()
        await failed
        writeGate = null
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('[role="switch"]')]
              .find((e) => e.getAttribute("aria-label") === "提及我的消息")
              ?.getAttribute("aria-checked") === "true",
        )
        assert.equal(await toggle("任务完成").getAttribute("aria-checked"), "false")
        assert.equal(puts.length, 2)
        checkpoint("category saving is isolated, rapid repeat is ignored, failure rolls back only its own category")
        failWrite = false
        const saved = page.waitForResponse((r) => pattern.test(r.url()) && r.request().method() === "PUT")
        await toggle("提及我的消息").click()
        assert((await saved).ok())
        await page.reload()
        await toggle("提及我的消息").waitFor()
        assert.equal(await toggle("提及我的消息").getAttribute("aria-checked"), "false")
        assert.equal(await toggle("任务完成").getAttribute("aria-checked"), "false")
        assert.equal(puts.length, 3)
        checkpoint("save retry succeeds and survives reloading server preferences")
        if (admin) {
          let releaseLate
          writeGate = new Promise((resolve) => {
            releaseLate = resolve
          })
          await toggle("提及我的消息").click()
          await until(() => puts.length === 4)
          await page.getByRole("button", { name: "刷新当前页面", exact: true }).click()
          await toggle("提及我的消息").waitFor()
          await page.waitForFunction(
            () =>
              [...document.querySelectorAll('[role="switch"]')]
                .find((element) => element.getAttribute("aria-label") === "提及我的消息")
                ?.getAttribute("aria-checked") === "false",
          )
          assert(await toggle("提及我的消息").isDisabled())
          assert.equal(await toggle("提及我的消息").getAttribute("aria-busy"), "true")
          let releaseSecond, releaseSnapshot
          secondWriteGate = new Promise((resolve) => {
            releaseSecond = resolve
          })
          await toggle("任务完成").click()
          await until(() => puts.length === 5)
          readGate = new Promise((resolve) => {
            releaseSnapshot = resolve
          })
          const beforeRead = reads
          releaseLate()
          writeGate = null
          await until(() => reads > beforeRead)
          const secondSaved = page.waitForResponse(
            (response) =>
              pattern.test(response.url()) &&
              response.request().method() === "PUT" &&
              response.url().includes("task.completed"),
          )
          releaseSecond()
          secondWriteGate = null
          await secondSaved
          releaseSnapshot()
          readGate = null
          await page.waitForFunction(
            () =>
              [...document.querySelectorAll('[role="switch"]')]
                .find((element) => element.getAttribute("aria-label") === "提及我的消息")
                ?.getAttribute("aria-checked") === "true",
          )
          await page.waitForFunction(
            () =>
              [...document.querySelectorAll('[role="switch"]')]
                .find((element) => element.getAttribute("aria-label") === "任务完成")
                ?.getAttribute("aria-checked") === "true",
          )
          assert.equal(puts.length, 5)
          checkpoint("detached committed values survive a parallel category save cancelling the reopened refresh")
        }
        rows = []
        await page.reload()
        await main.getByText("暂无消息", { exact: true }).waitFor()
        await shot(page, target, account, "empty")
        rows = structuredClone(initial)
        let releaseRead
        readGate = new Promise((r) => {
          releaseRead = r
        })
        await page.reload({ waitUntil: "domcontentloaded" })
        if (admin) await main.getByRole("status").waitFor()
        else await main.locator(".n-spin").waitFor()
        await shot(page, target, account, "loading")
        releaseRead()
        readGate = null
        await toggle("提及我的消息").waitFor()
        failRead = true
        const readFailure = page.waitForResponse((r) => pattern.test(r.url()) && r.request().method() === "GET")
        await page.reload()
        await readFailure
        if (admin) await main.getByText("加载通知偏好失败", { exact: true }).waitFor()
        else await main.getByText("暂无消息", { exact: true }).waitFor()
        await shot(page, target, account, "read-failure")
        failRead = false
        if (admin) await main.getByRole("button", { name: "重试", exact: true }).click()
        else await page.reload()
        await toggle("提及我的消息").waitFor()
        checkpoint("empty, gated loading, failed read and recovery work without preference writes")
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
        await toggle("Mentions").waitFor()
        await main.getByText("Notification preferences", { exact: true }).first().waitFor()
        await shot(page, target, account, "en-dark")
        await page.setViewportSize({ width: 390, height: 844 })
        await shot(page, target, account, "en-dark-390")
        const bounds = await page.evaluate(() => ({ width: document.body.scrollWidth, viewport: innerWidth }))
        assert(bounds.width <= bounds.viewport + 1)
        for (const name of ["Mentions", "Completed tasks", "System security", "User invitations"]) {
          const box = await toggle(name).boundingBox()
          assert(box && box.x >= 0 && box.x + box.width <= 390)
        }
        checkpoint("English, dark theme and 390px show all category switches without overflow")
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
    new URL("reviews/preferences-browser-development.json", output),
    JSON.stringify(results, null, 2) + "\n",
  )
}
if (results.some((r) => r.status === "failed")) process.exitCode = 1
