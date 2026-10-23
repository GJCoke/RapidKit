import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/menu/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
})
const results = []
const stamp = Date.now().toString(36)
async function shot(page, target, scene) {
  const toasts = page.locator(target === "admin" ? "[data-sonner-toast]" : ".n-message")
  if (await toasts.count()) await toasts.last().waitFor({ state: "hidden" })
  if (scene.startsWith("child-form"))
    await page
      .locator(target === "admin" ? '[data-slot="sheet-content"] .overflow-y-auto' : ".n-modal .n-scrollbar-container")
      .evaluateAll((nodes) =>
        nodes.forEach((node) => {
          node.scrollTop = 0
        }),
      )

  await page.screenshot({ path: fileURLToPath(new URL(`${target}-${scene}.png`, shots)), fullPage: true })
}
async function mutation(page, method, action) {
  const pending = page.waitForResponse(
    (r) => /\/manage\/menus(?:\/[^/?]+)?(?:\?|$)/.test(r.url()) && r.request().method() === method,
  )
  await action()
  const response = await pending
  const data = await response.json()
  console.log(method, data.code)
  return { data, request: response.request() }
}
try {
  for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = [],
      failures = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("requestfailed", (r) => {
      if (r.failure()?.errorText !== "net::ERR_ABORTED") failures.push(r.failure()?.errorText)
    })
    const name = `migration${stamp}${target}`
    const fixtures = []
    try {
      const origin = `http://localhost:${target === "admin" ? 3100 : 9527}`
      await page.goto(`${origin}/login`)
      await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill("admin")
      await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
      await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
      await page.waitForURL((url) => !url.pathname.startsWith("/login"))
      await page.goto(`${origin}/manage/menu`)
      await page.getByRole("cell", { name: "manage", exact: true }).waitFor()
      const dialog = () => (target === "admin" ? page.getByRole("dialog") : page.locator(".n-modal"))
      const submit = () => page.getByRole("button", { name: target === "admin" ? "保存" : "确认", exact: true }).last()
      async function select(field, option) {
        if (target === "admin") {
          await dialog().getByRole("combobox", { name: field, exact: true }).click()
          await page.getByRole("option", { name: option, exact: true }).click()
        } else {
          const item = dialog()
            .locator(".n-form-item")
            .filter({ has: page.locator(".n-form-item-label").filter({ hasText: field }) })
          await item.locator(".n-base-selection-label").click()
          await page
            .locator(".n-base-select-option")
            .filter({ hasText: new RegExp(`^${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
            .click()
        }
      }
      async function text(field, value) {
        if (target === "admin") await dialog().getByRole("textbox", { name: field, exact: true }).fill(value)
        else
          await dialog()
            .locator(".n-form-item")
            .filter({ has: page.locator(".n-form-item-label").filter({ hasText: field }) })
            .locator("input")
            .fill(value)
      }
      async function bool(field, value) {
        if (target === "admin") await dialog().getByRole("checkbox", { name: field, exact: true }).setChecked(value)
        else
          await dialog()
            .locator(".n-form-item")
            .filter({ has: page.locator(".n-form-item-label").filter({ hasText: field }) })
            .getByText(value ? "是" : "否", { exact: true })
            .click()
      }
      async function createRoot(suffix, validate = false) {
        await page.getByRole("button", { name: target === "admin" ? "新增菜单" : "新增", exact: true }).click()
        if (validate) {
          await submit().click()
          await page
            .getByText(target === "admin" ? "此项为必填项" : "不能为空", { exact: true })
            .first()
            .waitFor()
          await shot(page, target, "required")
        }
        await text("菜单名称", `${name}${suffix}`)
        await text("路由名称", `${name}${suffix}`)
        await text("国际化key", "")
        await select("布局", "base")
        if (target === "admin") await select("菜单状态", "禁用")
        else await dialog().getByText("禁用", { exact: true }).click()
        const result = await mutation(page, "POST", () => submit().click())
        assert.equal(result.data.code, 0, JSON.stringify(result.data))
        fixtures.push(result.data.data.id)
        await page
          .getByRole("cell", { name: `${name}${suffix}`, exact: true })
          .first()
          .waitFor()
        return result.data.data
      }
      const root = await createRoot("root", true)
      await shot(page, target, "created-root")
      await page.getByRole("button", { name: target === "admin" ? "新增菜单" : "新增", exact: true }).click()
      await text("菜单名称", `${name}duplicate`)
      await text("路由名称", `${name}root`)
      const duplicate = await mutation(page, "POST", () => submit().click())
      assert.notEqual(duplicate.data.code, 0)
      if (target === "admin")
        assert.equal(
          await dialog().getByRole("textbox", { name: "菜单名称", exact: true }).inputValue(),
          `${name}duplicate`,
        )
      else
        assert.equal(
          await dialog().getByPlaceholder("请输入菜单名称", { exact: true }).inputValue(),
          `${name}duplicate`,
        )
      await shot(page, target, "backend-error")
      await dialog().getByRole("button", { name: "取消", exact: true }).click()

      let rootRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: `${name}root`, exact: true }) })
      await rootRow.getByRole("button", { name: "新增子菜单", exact: true }).click()
      if (target === "admin") await select("菜单类型", "菜单")
      else await dialog().getByText("菜单", { exact: true }).click()
      await text("菜单名称", `${name}child`)
      await text("路由名称", `${name}root_child`)
      await text("国际化key", "")
      await text("路径参数", "id?")
      await select("页面组件", "home")
      if (target === "admin") {
        await dialog().getByRole("textbox", { name: "搜索权限码", exact: true }).fill("user:read")
        await dialog().getByRole("combobox", { name: "权限码", exact: true }).click()
        await page.getByRole("option", { name: /\(user:read\)$/ }).click()
      } else {
        const item = dialog()
          .locator(".n-form-item")
          .filter({ has: page.locator(".n-form-item-label").filter({ hasText: "权限码" }) })
        await item.locator(".n-base-selection-label").click()
        await item.locator(".n-base-selection-input").fill("user:read")
        await page.locator(".n-base-select-option").filter({ hasText: "user:read" }).click()
      }
      if (target === "admin") await select("菜单状态", "禁用")
      else await dialog().getByText("禁用", { exact: true }).click()
      await bool("缓存路由", true)
      await bool("支持多页签", true)
      await bool("隐藏菜单", true)
      await text("外链", "https://example.com/parity")
      if (target === "admin") {
        await page.getByRole("button", { name: "添加查询参数", exact: true }).click()
        await page.getByRole("textbox", { name: "请输入路由参数Key 1", exact: true }).fill("tab")
        await page.getByRole("textbox", { name: "请输入路由参数Value 1", exact: true }).fill("profile")
        await page.getByRole("button", { name: "添加查询参数", exact: true }).click()
        await page.getByRole("button", { name: "删除查询参数 2", exact: true }).click()
      } else {
        await dialog().locator(".n-dynamic-input").getByRole("button").first().click()
        await page.getByPlaceholder("请输入路由参数Key", { exact: true }).fill("tab")
        await page.getByPlaceholder("请输入路由参数Value", { exact: true }).fill("profile")
      }
      await shot(page, target, "child-form")
      await page.setViewportSize({ width: 390, height: 844 })
      await shot(page, target, "child-form-390")
      await page.setViewportSize({ width: 1440, height: 1000 })
      const child = await mutation(page, "POST", () => submit().click())
      assert.equal(child.data.code, 0, JSON.stringify(child.data))
      fixtures.push(child.data.data.id)
      const sent = JSON.parse(child.request.postData())
      assert.equal(sent.parentId, root.id)
      assert.equal(sent.permission, "user:read")
      assert.equal(sent.routePath, `/${name}root/child/:id?`)
      assert.deepEqual(sent.query, [{ key: "tab", value: "profile" }])
      rootRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: `${name}root`, exact: true }) })
      if (target === "admin") await rootRow.getByRole("button", { name: `展开 ${name}root`, exact: true }).click()
      else await rootRow.locator(".n-data-table-expand-trigger").click()
      const childRow = page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: `${name}child`, exact: true }) })
      await childRow.getByRole("button", { name: "编辑", exact: true }).click()
      await text("菜单名称", `${name}edited`)
      const edit = await mutation(page, "PUT", () => submit().click())
      assert.equal(edit.data.code, 0, JSON.stringify(edit.data))
      assert.equal(JSON.parse(edit.request.postData()).routePath, sent.routePath)
      await shot(page, target, "edited-tree")
      const selectedParent = page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: `${name}root`, exact: true }) })
      await selectedParent.getByRole("checkbox").click()
      assert.equal(
        await page
          .getByRole("row")
          .filter({ has: page.getByRole("cell", { name: `${name}edited`, exact: true }) })
          .getByRole("checkbox")
          .isChecked(),
        true,
      )
      await selectedParent.getByRole("checkbox").click()

      async function removeRow(row) {
        await row.getByRole("button", { name: "删除", exact: true }).click()
        const result = await mutation(page, "DELETE", () =>
          page
            .getByRole("button", { name: target === "admin" ? "删除" : "确认", exact: true })
            .last()
            .click(),
        )
        assert.equal(result.data.code, 0, JSON.stringify(result.data))
      }
      await removeRow(
        page.getByRole("row").filter({ has: page.getByRole("cell", { name: `${name}edited`, exact: true }) }),
      )
      fixtures.pop()
      await removeRow(
        page.getByRole("row").filter({ has: page.getByRole("cell", { name: `${name}root`, exact: true }) }),
      )
      fixtures.pop()
      await createRoot("one")
      await createRoot("two")
      for (const suffix of ["one", "two"]) {
        const row = page
          .getByRole("row")
          .filter({ has: page.getByRole("cell", { name: `${name}${suffix}`, exact: true }) })
        await row.getByRole("checkbox").click()
      }
      await page.getByRole("button", { name: "批量删除", exact: true }).click()
      const batch = await mutation(page, "DELETE", () =>
        page
          .getByRole("button", { name: target === "admin" ? "删除" : "确认", exact: true })
          .last()
          .click(),
      )
      assert.equal(batch.data.code, 0, JSON.stringify(batch.data))
      fixtures.length = 0
      if (target === "admin") {
        const pattern = /\/manage\/menus(?:\?|$)/
        let release, started
        const gate = new Promise((resolve) => {
            release = resolve
          }),
          pending = new Promise((resolve) => {
            started = resolve
          })
        await page.route(pattern, async (route) => {
          assert.equal(route.request().method(), "GET", "pagination probe cannot mutate real menus")
          const second = new URL(route.request().url()).searchParams.get("page") === "2"
          if (second) {
            started()
            await gate
          }
          const fixture = {
            id: second ? "second" : "first",
            menuName: second ? "Next fixture" : "First fixture",
            routeName: second ? "next_fixture" : "first_fixture",
            routePath: "/fixture",
            menuType: "1",
            iconType: "1",
            status: "1",
            order: 0,
            hideInMenu: false,
            keepAlive: false,
            constant: false,
            multiTab: false,
            query: [],
            children: [],
            createTime: "",
            updateTime: "",
          }
          await route.fulfill({
            json: { code: 0, data: { records: [fixture], page: second ? 2 : 1, pageSize: 10, total: 20 } },
          })
        })
        await page.reload()
        await page.getByRole("checkbox", { name: "选择 First fixture", exact: true }).waitFor()
        await page.getByRole("button", { name: "下一页", exact: true }).click()
        await pending
        assert.equal(await page.getByRole("checkbox", { name: "选择本页", exact: true }).isDisabled(), true)
        assert.equal(await page.getByRole("checkbox", { name: "选择 First fixture", exact: true }).count(), 0)
        await shot(page, target, "pagination-loading")
        release()
        await page.getByRole("checkbox", { name: "选择 Next fixture", exact: true }).waitFor()
        assert.equal(await page.getByRole("button", { name: "批量删除", exact: true }).isDisabled(), true)
        await page.unrouteAll({ behavior: "wait" })
        await page.reload()
        await page.getByRole("cell", { name: "manage", exact: true }).waitFor()
      }
      assert.deepEqual(failures, [])
      assert.deepEqual(
        errors.filter((e) => (target === "frontend" && e === "Array(3)" ? false : true)),
        [],
      )
      results.push({ target, status: "passed", errors, failures, fixtures })
    } catch (e) {
      await shot(page, target, "crud-failure")
      results.push({ target, status: "failed", message: String(e), errors, failures, fixtures })
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(new URL("reviews/menu-browser.json", output), JSON.stringify(results, null, 2) + "\n")
}
for (const result of results) console.log(result)
if (results.some((r) => r.status !== "passed")) process.exitCode = 1
