import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

// Real temporary department CRUD and real admin→existing guest sessions; never write user profiles or passwords.
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL(`screenshots/user/${process.env.PARITY_RUN || "current"}/`, output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true })
const results = [],
  api = "http://localhost:16000/api/v1"
async function credentials(page, admin) {
  return page.evaluate(
    (admin) =>
      admin
        ? JSON.parse(localStorage.getItem("impersonation") || "null")?.accessToken ||
          localStorage.getItem("accessToken") ||
          ""
        : JSON.parse(localStorage.getItem("RAPIDKIT_token") || '""'),
    admin,
  )
}
async function active(page, admin) {
  return page.evaluate(
    (admin) => Boolean(localStorage.getItem(admin ? "impersonation" : "RAPIDKIT_impersonation")),
    admin,
  )
}
async function until(check) {
  const end = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < end, "condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}
try {
  for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
    const admin = target === "admin",
      origin = `http://localhost:${admin ? 3100 : 9527}`
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage(),
      errors = [],
      failures = [],
      consoleErrors = [],
      checks = []
    const temporary = new Set(),
      prefix = `migration-live-${Date.now().toString(36)}`
    let actorToken = "",
      subjectToken = "",
      createdSessions = 0,
      stoppedSessions = 0
    const monitor = (tab) => {
      tab.setDefaultTimeout(15000)
      tab.on("pageerror", (error) => errors.push(error.message))
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      tab.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
    }
    monitor(page)
    const headers = (token) => ({ Authorization: `Bearer ${token}` })
    const checkpoint = (text) => {
      checks.push(text)
      console.log(target, checks.length, text)
    }
    const shot = (tab, scene) =>
      tab.screenshot({
        path: fileURLToPath(new URL(`${target}-live-${scene}.png`, shots)),
        fullPage: true,
        animations: "disabled",
      })
    const form = (title) =>
      admin
        ? page.getByRole("dialog", { name: title, exact: true })
        : page
            .locator(".n-drawer-content")
            .filter({ has: page.getByText(title, { exact: true }) })
            .filter({ visible: true })
    const departmentMenu = async (name) =>
      page.getByRole("button", { name: admin ? `${name}操作` : `${name} · 部门操作`, exact: true }).click()
    const menuItem = (label) =>
      admin
        ? page.getByRole("menuitem", { name: label, exact: true })
        : page.locator(".n-dropdown-menu").filter({ visible: true }).getByText(label, { exact: true })
    const mutation = async (method, action) => {
      const response = page.waitForResponse(
        (response) =>
          /\/departments(?:\/[^/]+)?$/.test(new URL(response.url()).pathname) && response.request().method() === method,
      )
      await action()
      const body = await (await response).json()
      assert.equal(String(body.code), "0", "temporary department operation must succeed")
      return body.data
    }
    try {
      await page.goto(`${origin}/login`)
      await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill("admin")
      await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
      await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
      await page.waitForURL((url) => !url.pathname.startsWith("/login"))
      actorToken = await credentials(page, admin)
      assert(actorToken)
      const actor = (
        await (await context.request.get(`${api}/auth/user/info`, { headers: headers(actorToken) })).json()
      ).data
      assert.equal(actor.isAdmin, true)
      await page.goto(`${origin}/manage/user`)
      await page.getByRole("button", { name: "新增用户", exact: true }).waitFor()
      await page.getByRole("button", { name: admin ? "新增根部门" : "新增顶级部门", exact: true }).click()
      let drawer = form("新增部门")
      const name = admin
        ? drawer.getByRole("textbox", { name: "部门名称", exact: true })
        : drawer.getByPlaceholder("请输入部门名称", { exact: true })
      const code = admin
        ? drawer.getByRole("textbox", { name: "部门编码", exact: true })
        : drawer.getByPlaceholder("请输入部门编码", { exact: true })
      await name.fill(prefix)
      await code.fill(prefix)
      const department = await mutation("POST", () =>
        drawer.getByRole("button", { name: admin ? "保存" : "确认", exact: true }).click(),
      )
      temporary.add(department.id)
      await drawer.waitFor({ state: "hidden" })
      await departmentMenu(prefix)
      await menuItem("编辑部门").click()
      drawer = form("编辑部门")
      await (
        admin
          ? drawer.getByRole("textbox", { name: "部门名称", exact: true })
          : drawer.getByPlaceholder("请输入部门名称", { exact: true })
      ).fill(`${prefix}-edited`)
      await mutation("PUT", () => drawer.getByRole("button", { name: admin ? "保存" : "确认", exact: true }).click())
      await drawer.waitFor({ state: "hidden" })
      await departmentMenu(`${prefix}-edited`)
      await menuItem("删除").click()
      const confirm = admin ? page.getByRole("alertdialog") : page.locator(".n-dialog").filter({ visible: true })
      await shot(page, "department-confirmation")
      await mutation("DELETE", () =>
        confirm.getByRole("button", { name: admin ? "删除" : "确认", exact: true }).click(),
      )
      temporary.delete(department.id)
      await confirm.waitFor({ state: "hidden" })
      const tree = await (await context.request.get(`${api}/departments/tree`, { headers: headers(actorToken) })).json()
      assert.equal(JSON.stringify(tree.data).includes(department.id), false)
      checkpoint("real UI temporary department create/edit/delete; GET confirms cleanup")

      const response = await (
        await context.request.get(`${api}/users`, {
          headers: headers(actorToken),
          params: { keyword: "guest", page: 1, pageSize: 20 },
        })
      ).json()
      const guest = response.data.records.find((row) => row.username === "guest")
      assert(guest && !guest.isAdmin && guest.status === "1", "existing guest is an eligible simulation target")
      await (
        admin
          ? page.getByRole("textbox", { name: "关键词", exact: true })
          : page.getByPlaceholder("搜索姓名、用户名或邮箱", { exact: true })
      ).fill("guest")
      await page.getByRole("button", { name: admin ? "查询" : "搜索", exact: true }).click()
      const row = page.getByRole("row").filter({ has: page.getByText("guest", { exact: true }) })
      await row.waitFor()
      const other = await context.newPage()
      monitor(other)
      await other.goto(`${origin}/manage/user`)
      await other.getByRole("button", { name: "新增用户", exact: true }).waitFor()
      await row.getByRole("button", { name: admin ? `${guest.name}的操作` : "更多操作", exact: true }).click()
      await menuItem(admin ? "开始模拟登录" : "模拟登录").click()
      const dialog = admin
        ? page.getByRole("dialog", { name: "确认模拟登录", exact: true })
        : page
            .locator(".n-card")
            .filter({ has: page.getByText("确认模拟用户身份", { exact: true }) })
            .filter({ visible: true })
      await (
        admin
          ? dialog.getByRole("textbox", { name: "操作原因（可选）", exact: true })
          : dialog.getByPlaceholder("填写排查原因（可选）", { exact: true })
      ).fill("Admin migration parity verification")
      await shot(page, "impersonation-confirmation")
      const create = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith("/auth/impersonations") && response.request().method() === "POST",
      )
      await dialog.getByRole("button", { name: admin ? "开始模拟登录" : "模拟登录", exact: true }).click()
      const created = await (await create).json()
      assert.equal(String(created.code), "0", "real simulation creation must succeed")
      createdSessions++
      await page.getByRole("button", { name: admin ? "退出模拟登录" : "退出模拟", exact: true }).waitFor()
      await page.waitForURL((url) => url.pathname === "/home")
      await other.getByRole("button", { name: admin ? "退出模拟登录" : "退出模拟", exact: true }).waitFor()
      subjectToken = await credentials(page, admin)
      const current = await (
        await context.request.get(`${api}/auth/impersonations/current`, { headers: headers(subjectToken) })
      ).json()
      assert.equal(String(current.code), "0")
      assert.equal(current.data.subject.id, guest.id)
      assert.equal(current.data.actor.id, actor.id)
      assert.equal(current.data.sessionId, created.data.sessionId)
      await other.locator("tbody tr").filter({ hasText: guest.username }).first().waitFor()
      assert.equal(await other.getByRole("button", { name: "新增用户", exact: true }).count(), 0)
      assert.equal(await other.getByRole("button", { name: "编辑", exact: true }).count(), 0)
      await shot(other, "subject-cross-tab-read-only")
      await shot(page, "subject-home")
      checkpoint(
        "real admin→guest session accepted by backend; second tab updates to guest permissions and removes writes",
      )
      const stop = other.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith("/auth/impersonations/current") &&
          response.request().method() === "DELETE",
      )
      await other.getByRole("button", { name: admin ? "退出模拟登录" : "退出模拟", exact: true }).click()
      assert.equal(String((await (await stop).json()).code), "0")
      stoppedSessions++
      await until(async () => !(await active(page, admin)) && !(await active(other, admin)))
      await other.getByRole("button", { name: "新增用户", exact: true }).waitFor()
      assert.equal(new URL(other.url()).pathname, "/manage/user")
      await page.goto(`${origin}/manage/user`)
      await page.getByRole("button", { name: "新增用户", exact: true }).waitFor()
      assert.equal(
        await page.getByRole("button", { name: admin ? "退出模拟登录" : "退出模拟", exact: true }).count(),
        0,
      )
      const restored = await credentials(page, admin)
      const actual = await (await context.request.get(`${api}/auth/user/info`, { headers: headers(restored) })).json()
      assert.equal(actual.data.id, actor.id)
      assert.equal(actual.data.isAdmin, true)
      const revoked = await (
        await context.request.get(`${api}/auth/impersonations/current`, { headers: headers(subjectToken) })
      ).json()
      assert.equal(String(revoked.code), "14017")
      await shot(other, "actor-restored-return-path")
      checkpoint(
        "exit in the other tab restores both administrator identities and authorized return path; old subject session is invalid",
      )
      assert.deepEqual(errors, [])
      assert.deepEqual(failures, [])
      assert.deepEqual(consoleErrors, [])
      results.push({
        target,
        checks,
        errors,
        failures,
        consoleErrors,
        realDepartmentWrites: 3,
        createdSessions,
        stoppedSessions,
        realUserProfileWrites: 0,
      })
    } catch (error) {
      await shot(page, "failure").catch(() => {})
      results.push({
        target,
        checks,
        error: String(error),
        errors,
        failures,
        consoleErrors,
        createdSessions,
        stoppedSessions,
      })
      console.error(target, error)
    } finally {
      try {
        if (await active(page, admin)) {
          const token = await credentials(page, admin)
          await context.request.delete(`${api}/auth/impersonations/current`, { headers: headers(token) })
        }
        for (const id of temporary) {
          const result = await (
            await context.request.delete(`${api}/departments/${id}`, { headers: headers(actorToken) })
          ).json()
          assert.equal(String(result.code), "0", "temporary department cleanup must succeed")
        }
      } catch (cleanupError) {
        results.at(-1).cleanupError = String(cleanupError)
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
}
await writeFile(new URL("user-live-browser-results.json", output), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
assert(results.every((result) => !result.error && !result.cleanupError))
