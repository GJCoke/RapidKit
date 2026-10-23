import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/role/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
})
const results = []
const searches = new WeakMap()
const stamp = Date.now().toString(36)
async function shot(page, target, scene) {
  if (scene.startsWith("permissions")) {
    const toasts = page.locator(target === "admin" ? "[data-sonner-toast]" : ".n-message")
    if (await toasts.count()) await toasts.last().waitFor({ state: "hidden" })
  }

  await page.screenshot({ path: fileURLToPath(new URL(`${target}-${scene}.png`, shots)), fullPage: true })
}
async function login(page, target, account) {
  const origin = target === "admin" ? "http://localhost:3100" : "http://localhost:9527"
  await page.goto(`${origin}/login`)
  await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
  await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
  await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))
  await page.goto(`${origin}/manage/role`)
  await page.getByRole("cell", { name: "ADMIN", exact: true }).waitFor()
}
async function response(page, method, action) {
  console.log("waiting mutation", method)
  const promise = page.waitForResponse(
    (r) => new URL(r.url()).pathname.includes("/roles") && r.request().method() === method,
  )
  await action()
  const res = await promise
  console.log("mutation received", method, res.url())
  return { data: await res.json(), request: res.request() }
}
async function search(page, target, value) {
  console.log(target, "search", value, searches.get(page))
  await (
    target === "admin"
      ? page.locator("#role-keyword")
      : page.getByPlaceholder("请输入角色名称", { exact: true }).first()
  ).fill(value)
  const pending =
    searches.get(page) === value
      ? Promise.resolve()
      : page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/roles") && r.request().method() === "GET")
  await page.getByRole("button", { name: "搜索", exact: true }).click()
  await pending
  searches.set(page, value)
  console.log(target, "search done")
}
async function fillRole(page, target, name, code) {
  if (target === "admin") {
    await page.locator("#role-name").fill(name)
    await page.locator("#role-code").fill(code)
    await page.locator("#role-description").fill("Migration browser fixture")
  } else {
    await page.getByPlaceholder("请输入角色名称", { exact: true }).last().fill(name)
    await page.getByPlaceholder("请输入角色编码", { exact: true }).fill(code)
    await page.locator(".n-drawer").getByText("启用", { exact: true }).click()
    await page.getByPlaceholder("请输入角色描述", { exact: true }).fill("Migration browser fixture")
  }
}
async function create(page, target, code, validate = false) {
  await page.getByRole("button", { name: target === "admin" ? "新增角色" : "新增", exact: true }).click()
  const submit = page.getByRole("button", { name: target === "admin" ? "保存" : "确认", exact: true })
  if (validate) {
    await submit.click()
    await page
      .getByText(target === "admin" ? "此字段为必填项" : "不能为空", { exact: true })
      .first()
      .waitFor()
    await shot(page, target, "required")
  }
  await fillRole(page, target, code, code)
  const res = await response(page, "POST", () => submit.click())
  assert.equal(res.data.code, 0, JSON.stringify(res.data))
  return res.data.data
}
async function confirmDelete(page, target, action) {
  await action()
  return response(page, "DELETE", () =>
    page
      .getByRole("button", { name: target === "admin" ? "删除" : "确认", exact: true })
      .last()
      .click(),
  )
}
try {
  for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = [],
      failures = []
    page.on("response", (r) => {
      if (r.url().includes("/roles")) console.log(target, r.request().method(), r.url())
    })
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("requestfailed", (r) => {
      if (r.failure()?.errorText !== "net::ERR_ABORTED") failures.push(r.failure()?.errorText)
    })
    const prefix = `migration_${stamp}_${target}`
    try {
      console.log(target, prefix, "start")
      await login(page, target, "admin")
      await shot(page, target, "list")
      await search(page, target, `${prefix}_empty`)
      await page
        .getByText(target === "admin" ? "暂无数据" : "无数据", { exact: true })
        .first()
        .waitFor()
      await shot(page, target, "empty")
      await search(page, target, prefix)
      await create(page, target, `${prefix}_one`, true)
      await page.getByRole("button", { name: target === "admin" ? "新增角色" : "新增", exact: true }).click()
      await fillRole(page, target, `${prefix}_duplicate`, `${prefix}_one`)
      const duplicate = await response(page, "POST", () =>
        page.getByRole("button", { name: target === "admin" ? "保存" : "确认", exact: true }).click(),
      )
      assert.notEqual(duplicate.data.code, 0)
      await shot(page, target, "backend-form-error")
      await page.getByRole("button", { name: "取消", exact: true }).click()

      await search(page, target, prefix)
      let row = page.getByRole("row").filter({ hasText: `${prefix}_one` })
      await row.getByRole("button", { name: "编辑", exact: true }).click()
      if (target === "admin") await page.locator("#role-name").fill(`${prefix}_edited`)
      else await page.getByPlaceholder("请输入角色名称", { exact: true }).last().fill(`${prefix}_edited`)
      await shot(page, target, "edit")
      const update = await response(page, "PUT", () =>
        page.getByRole("button", { name: target === "admin" ? "保存" : "确认", exact: true }).click(),
      )
      assert.equal(update.data.code, 0)
      assert.equal("permissionCodes" in update.request.postDataJSON(), false)
      row = page.getByRole("row").filter({ hasText: `${prefix}_one` })
      await row.getByRole("button", { name: target === "admin" ? "权限配置" : "权限配置", exact: true }).click()
      await page.getByRole("checkbox", { name: "编辑用户", exact: true }).waitFor()
      if (target === "admin") {
        await page.getByRole("button", { name: "取消", exact: true }).click()
        await page.route(/\/manage\/menus(?:\?|$)/, (route) =>
          route.fulfill({ json: { code: 500, message: "Migration menu failure fixture", data: null } }),
        )
        await row.getByRole("button", { name: "权限配置", exact: true }).click()
        await page.getByText("菜单结构加载失败，已切换为按资源配置，草稿仍保留。", { exact: true }).waitFor()
        await page.getByRole("navigation", { name: "按资源调整", exact: true }).waitFor()
        assert.equal(await page.getByRole("navigation", { name: "业务模块", exact: true }).count(), 0)
        await page.getByRole("checkbox", { name: "编辑用户", exact: true }).click()
        await shot(page, target, "permissions-menu-fallback")
        await page.unrouteAll({ behavior: "wait" })
        await page.getByRole("button", { name: "重试菜单分组", exact: true }).click()
        await page.getByRole("navigation", { name: "业务模块", exact: true }).waitFor()
        assert(
          await page.getByRole("checkbox", { name: "编辑用户", exact: true }).isChecked(),
          "menu retry retains draft",
        )
        await page.getByRole("checkbox", { name: "编辑用户", exact: true }).click()
      }
      await shot(page, target, "permissions")
      await page.setViewportSize({ width: 390, height: 844 })
      if (target === "admin")
        await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
      const modal = target === "admin" ? page.getByRole("dialog") : page.locator(".permission-modal")
      assert((await modal.boundingBox()).width <= 390)
      if (target === "admin")
        assert(
          await modal.locator("[data-slot=dialog-title]").evaluate((node) => node.scrollWidth <= node.clientWidth),
          "permission title fits narrow screen",
        )
      await shot(page, target, "permissions-390")
      await page.setViewportSize({ width: 1440, height: 1000 })

      console.log(target, "permissions loaded")
      await page.getByRole("checkbox", { name: "编辑用户", exact: true }).click()
      if (target === "admin") {
        assert.equal(await page.getByRole("button", { name: "刷新当前页面", exact: true }).count(), 0)
        await assert.rejects(() => page.locator('button[aria-label="刷新当前页面"]').click({ timeout: 500 }), /Timeout/)
        const reloaded = page.waitForResponse(
          (r) => r.request().method() === "GET" && new URL(r.url()).pathname.endsWith("/permissions"),
        )
        await page.evaluate(() => {
          window.dispatchEvent(new Event("offline"))
          window.dispatchEvent(new Event("online"))
        })
        await reloaded
        await page.waitForLoadState("networkidle")
        assert(
          await page.getByRole("checkbox", { name: "编辑用户", exact: true }).isChecked(),
          "reconnect preserves draft",
        )
      }

      await page.getByRole("button", { name: "预览并保存", exact: true }).click()
      await shot(page, target, "review")
      const grant = await response(page, "PUT", () =>
        page.getByRole("button", { name: "保存权限", exact: true }).click(),
      )
      assert.equal(grant.data.code, 0)
      assert(grant.request.postDataJSON().permissionCodes.includes("user:update"))
      await confirmDelete(page, target, () => row.getByRole("button", { name: "删除", exact: true }).click())
      await create(page, target, `${prefix}_two`)
      await create(page, target, `${prefix}_three`)
      await search(page, target, prefix)
      await page
        .getByRole("row")
        .filter({ hasText: `${prefix}_two` })
        .waitFor()
      if (target === "admin") await page.getByRole("checkbox", { name: "选择当前页", exact: true }).click()
      else await page.locator("thead").getByRole("checkbox").click()
      await shot(page, target, "batch")
      console.log(target, "batch ready")
      const deleted = await confirmDelete(page, target, () =>
        page.getByRole("button", { name: "批量删除", exact: true }).click(),
      )
      assert.equal(deleted.data.code, 0)
      await search(page, target, "")
      if (target === "admin") {
        await page.getByRole("button", { name: "切换语言", exact: true }).click()
        await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
        await page.keyboard.press("Escape")
        await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
        await page.setViewportSize({ width: 390, height: 844 })
        if (target === "admin")
          await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
        await shot(page, target, "en-dark-390")
      } else {
        await page.setViewportSize({ width: 390, height: 844 })
        if (target === "admin")
          await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
        await shot(page, target, "zh-390")
      }
      assert.deepEqual(target === "frontend" ? errors.filter((e) => e !== "Array(3)") : errors, [])
      assert.deepEqual(failures, [])
      results.push({ target, scenario: "admin CRUD, batch, permissions", status: "passed", errors, failures })
    } catch (e) {
      await shot(page, target, "failure")
      results.push({ target, prefix, status: "failed", message: String(e), errors, failures })
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(new URL("reviews/role-browser.json", output), JSON.stringify(results, null, 2) + "\n")
}
for (const result of results) console.log(result)
if (results.some((r) => r.status !== "passed")) process.exitCode = 1
