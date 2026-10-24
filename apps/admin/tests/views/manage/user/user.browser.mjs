import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { userFixtures } from "./user-fixtures.mjs"

const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL(`screenshots/user/${process.env.PARITY_RUN || "current"}/`, output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true })
const results = []
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
        origin = `http://localhost:${admin ? 3100 : 9527}`
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage(),
        fixture = userFixtures(account),
        s = fixture.state
      const errors = [],
        consoleErrors = [],
        failures = [],
        checks = []
      let info,
        closing = false,
        english = false
      page.setDefaultTimeout(15000)
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      page.on("response", async (response) => {
        if (!info && new URL(response.url()).pathname.endsWith("/auth/user/info")) {
          try {
            const body = await response.json()
            if (body.data) {
              info = body.data
              if (account === "admin") s.actorId = info.id
            }
          } catch (error) {
            if (!closing) errors.push(`Auth response parse: ${String(error)}`)
          }
        }
      })
      await page.route(/\/(users|departments|roles)(?:\/|\?|$)/, fixture.handler)
      const main = page.locator("main")
      const panel = () => (admin ? main.locator("aside").last() : main.locator("aside.department-panel"))
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
      const userRow = (name) => main.getByRole("row").filter({ hasText: name })
      const drawer = (title) =>
        admin
          ? page.getByRole("dialog", { name: title, exact: true })
          : page
              .locator(".n-drawer-content")
              .filter({ has: page.getByText(title, { exact: true }) })
              .filter({ visible: true })
      const modal = (title) =>
        admin
          ? page.getByRole("dialog", { name: title, exact: true })
          : page
              .locator(".n-card")
              .filter({ has: page.getByText(title, { exact: true }) })
              .filter({ visible: true })
              .last()
      const save = (element) => element.getByRole("button", { name: admin ? "保存" : "确认", exact: true }).click()
      const cancel = async (element) => {
        await element.getByRole("button", { name: english ? "Cancel" : "取消", exact: true }).click()
        await element.waitFor({ state: "hidden" })
      }
      async function search(value) {
        await (
          admin
            ? main.getByRole("textbox", { name: "关键词", exact: true })
            : main.getByPlaceholder("搜索姓名、用户名或邮箱", { exact: true })
        ).fill(value)
        const previous = s.lists.length
        await main.getByRole("button", { name: admin ? "查询" : "搜索", exact: true }).click()
        await until(() => s.lists.length > previous)
      }
      async function allUsers() {
        await panel()
          .getByRole("button", { name: admin ? /^所有用户/ : /^全部用户/ })
          .click()
        await userRow("migration_alice").waitFor()
      }
      async function rowMenu(name) {
        await userRow(name)
          .getByRole("button", {
            name: admin
              ? `${name === "migration_alice" ? "Migration Alice" : name === "migration_pending" ? "Migration Pending" : "Migration Administrator"}的操作`
              : "更多操作",
            exact: true,
          })
          .click()
      }
      async function departmentMenu(name) {
        await panel()
          .getByRole("button", { name: admin ? `${name}操作` : `${name} · 部门操作`, exact: true })
          .click()
      }
      async function selectDepartment(name, index) {
        if (admin)
          await panel()
            .getByRole("button", { name: `选择${name}`, exact: true })
            .click()
        else
          await panel()
            .locator(".n-tree-node")
            .filter({ hasText: name })
            .first()
            .locator(".n-tree-node-content")
            .click()
        await until(() => s.lists.at(-1)?.departmentId === s.departments[index].id)
      }
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        await until(() => Boolean(info))
        await page.goto(`${origin}/manage/user`)
        await userRow("migration_alice").waitFor()
        await panel()
          .getByRole("textbox", { name: admin ? "搜索部门" : "搜索全部部门", exact: true })
          .waitFor()
        assert.equal(s.lists.at(-1).pageSize, "20")
        await main.getByText("Migration Dept 1 / Migration Dept 2", { exact: true }).first().waitFor()
        await shot("list-zh-light")
        checkpoint("real account permissions, combined identity/roles/status/full department paths and 20-row list")
        await main.getByRole("button", { name: "列设置", exact: true }).click()
        const emailColumn = page.getByRole("checkbox", { name: "邮箱", exact: true })
        await emailColumn.click()
        assert.equal(await main.getByRole("columnheader", { name: "邮箱", exact: true }).count(), 0)
        await emailColumn.click()
        await page.keyboard.press("Escape")
        await main.getByRole("columnheader", { name: "邮箱", exact: true }).waitFor()
        const originalRows = [...s.rows]
        s.rows.push(
          ...Array.from({ length: 25 }, (_, index) => ({
            ...originalRows[0],
            id: `10000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`,
            name: `Pagination ${index}`,
            username: `pagination_${index}`,
          })),
        )
        let previousLists = s.lists.length
        await main.getByRole("button", { name: "刷新", exact: true }).click()
        await until(() => s.lists.length > previousLists)
        await userRow("pagination_0").waitFor()
        if (admin) await main.getByRole("button", { name: "下一页", exact: true }).click()
        else await main.locator(".n-pagination-item").getByText("2", { exact: true }).click()
        await until(() => s.lists.at(-1)?.page === "2")
        await userRow("pagination_20").waitFor()
        for (const size of [50, 20]) {
          if (admin) {
            await main.getByRole("combobox", { name: "每页条数", exact: true }).click()
            await page.getByRole("option", { name: `${size} 条/页`, exact: true }).click()
          } else {
            await main.locator(".n-pagination .n-select").click()
            await page
              .locator(".n-base-select-option")
              .filter({ hasText: new RegExp(`^${size}\\D`) })
              .filter({ visible: true })
              .click()
          }
          if (admin) {
            await until(
              async () =>
                (await main.getByRole("combobox", { name: "每页条数", exact: true }).innerText()).trim() ===
                `${size} 条/页`,
            )
            await until(async () => (await main.locator("tbody tr").count()) === Math.min(size, 29))
            if (size === 50) {
              assert.equal(s.lists.at(-1).pageSize, "50")
              assert.equal(s.lists.at(-1).page, "1")
            }
            // Returning to a cached page still verifies the authoritative 20-row view.
          } else await until(() => s.lists.at(-1)?.pageSize === String(size) && s.lists.at(-1)?.page === "1")
        }
        s.rows = originalRows
        previousLists = s.lists.length
        await main.getByRole("button", { name: "刷新", exact: true }).click()
        await until(() => s.lists.length > previousLists)
        await userRow("migration_alice").waitFor()
        if (admin) {
          await main.getByRole("combobox", { name: "用户状态", exact: true }).click()
          await page.getByRole("option", { name: "待激活", exact: true }).click()
        } else {
          await main.locator(".n-select").first().click()
          await page.locator(".n-base-select-option").filter({ hasText: "待激活" }).filter({ visible: true }).click()
        }
        previousLists = s.lists.length
        await main.getByRole("button", { name: admin ? "查询" : "搜索", exact: true }).click()
        await until(() => s.lists.length > previousLists && s.lists.at(-1)?.status === "3")
        await userRow("migration_pending").waitFor()
        assert.equal(await userRow("migration_alice").count(), 0)
        await main.getByRole("button", { name: "重置", exact: true }).click()
        await userRow("migration_alice").waitFor()
        checkpoint("column visibility, remote page/page-size changes, refresh, pending-status filter and reset")

        await search("migration_no_match")
        await main
          .getByText(admin ? "暂无数据" : "无数据", { exact: true })
          .first()
          .waitFor()
        await shot("empty")
        await main.getByRole("button", { name: "重置", exact: true }).click()
        await userRow("migration_alice").waitFor()
        await selectDepartment("Migration Dept 2", 1)
        await userRow("migration_alice").waitFor()
        assert.equal(s.lists.at(-1).includeChildren, "true")
        if (admin) {
          await main.getByRole("checkbox", { name: "包含下级部门", exact: true }).click()
          await until(() => s.lists.at(-1)?.includeChildren === "false")
        }
        await allUsers()
        const departmentSearch = panel().getByRole("textbox", {
          name: admin ? "搜索部门" : "搜索全部部门",
          exact: true,
        })
        await departmentSearch.fill("Migration Dept 7")
        if (admin) await panel().getByRole("button", { name: "定位Migration Dept 7", exact: true }).click()
        else await panel().locator(`[data-department-result="${s.departments[6].id}"]`).click()
        await until(() => s.lists.at(-1)?.departmentId === s.departments[6].id)
        await userRow("migration_disabled").waitFor()
        await shot("deep-department")
        await panel().getByRole("button", { name: "返回上级", exact: true }).click()
        if (admin) {
          const rail = await panel().boundingBox(),
            root = await panel().getByRole("button", { name: "所有部门", exact: true }).boundingBox()
          assert(
            root.x >= rail.x && root.x + root.width <= rail.x + rail.width + 1,
            "deep directory home control must stay within its own rail",
          )
        }
        await panel()
          .getByRole("button", { name: admin ? "所有部门" : "全部组织", exact: true })
          .click()
        await allUsers()
        checkpoint(
          "keyword empty/reset, department/subtree filtering, deep search/location/breadcrumb/back/root navigation",
        )

        let release
        s.gate = new Promise((resolve) => {
          release = resolve
        })
        const beforeLoading = s.lists.length
        await main.getByRole("button", { name: "刷新", exact: true }).click()
        await until(() => s.lists.length > beforeLoading)
        await shot("loading")
        release()
        s.gate = null
        await userRow("migration_alice").waitFor()
        s.listMode = "failed"
        await search("fixture_failure")
        if (admin) await main.getByText("加载失败", { exact: false }).waitFor()
        else await page.getByText("Migration fixture failure", { exact: false }).first().waitFor()
        await shot("load-failed")
        s.listMode = "ready"
        await main.getByRole("button", { name: "重置", exact: true }).click()
        await userRow("migration_alice").waitFor()
        checkpoint("gated loading, backend list failure and explicit recovery")

        if (account === "admin") {
          await main.getByRole("button", { name: "新增用户", exact: true }).click()
          let form = drawer("新增用户")
          await save(form)
          if (admin) await until(async () => (await form.locator('[data-invalid="true"]').count()) === 3)
          else await form.getByText("不能为空", { exact: true }).first().waitFor()
          await shot("user-required")
          const field = (label, placeholder) =>
            admin
              ? form.getByRole("textbox", { name: label, exact: true })
              : form.getByPlaceholder(placeholder, { exact: true })
          await field("姓名", "请输入姓名").fill("Parity Alpha")
          await until(async () => (await field("用户名", "请输入用户名").inputValue()) === "parityalpha")
          await field("邮箱", "请输入邮箱").fill("invalid-email")
          await save(form)
          await shot("user-format")
          assert.equal(s.writes.filter((write) => write.resource === "/users" && write.method === "POST").length, 0)
          await field("邮箱", "请输入邮箱").fill("parityalpha@example.test")
          s.writeFailure = true
          const writesBefore = s.writes.length
          await save(form)
          await until(() => s.writes.length === writesBefore + 1)
          await form.waitFor()
          assert.equal(await field("姓名", "请输入姓名").inputValue(), "Parity Alpha")
          await shot("user-save-failed")
          await save(form)
          await form.waitFor({ state: "hidden" })
          await userRow("parityalpha").waitFor()
          const created = s.rows.find((row) => row.username === "parityalpha")
          assert(created)
          assert.equal(created.status, "3")
          const create = s.writes.findLast((write) => write.resource === "/users" && write.method === "POST")
          assert.equal("password" in create.body, false)
          await userRow("parityalpha").getByRole("button", { name: "编辑", exact: true }).click()
          form = drawer("编辑用户")
          await field("姓名", "请输入姓名").fill("Parity Edited")
          s.pinyinMode = "mismatch"
          await save(form)
          let pinyin = admin
            ? page.getByRole("alertdialog", { name: "确认用户名", exact: true })
            : page.locator(".n-dialog").filter({ visible: true })
          await pinyin.getByText(admin ? "确认用户名" : "用户名与姓名拼音不一致", { exact: true }).waitFor()
          await shot("pinyin-confirmation")
          await pinyin.getByRole("button", { name: admin ? "返回编辑" : "返回修改", exact: true }).click()
          await pinyin.waitFor({ state: "hidden" })
          if (admin) {
            await until(
              async () =>
                await field("用户名", "请输入用户名").evaluate((element) => document.activeElement === element),
            )
          } else {
            // D22: source nextTick focus is lost when Naive finishes closing; preserve its exact observed baseline.
            await until(async () => await page.evaluate(() => document.activeElement === document.body))
            assert.equal(await field("用户名", "请输入用户名").isEnabled(), true)
            assert.equal(await field("用户名", "请输入用户名").inputValue(), "parityalpha")
            await shot("pinyin-return-source-D22")
          }
          await save(form)
          pinyin = admin
            ? page.getByRole("alertdialog", { name: "确认用户名", exact: true })
            : page.locator(".n-dialog").filter({ visible: true })
          await pinyin.getByRole("button", { name: "仍然提交", exact: true }).click()
          await form.waitFor({ state: "hidden" })
          s.pinyinMode = "ready"
          assert.equal(s.rows.find((row) => row.id === created.id).name, "Parity Edited")
          assert.equal(s.writes.findLast((write) => write.resource.endsWith(created.id)).body.status, "3")
          await shot("user-edited")
          await rowMenu("migration_pending")
          const resendBefore = s.writes.length
          if (admin) await page.getByRole("menuitem", { name: "重发邀请", exact: true }).click()
          else await page.getByText("重新邀请", { exact: true }).filter({ visible: true }).click()
          await until(() => s.writes.length === resendBefore + 1)
          assert(s.writes.at(-1).resource.endsWith("/resend-invite"))

          await rowMenu("migration_alice")
          if (admin) await page.getByRole("menuitem", { name: "开始模拟登录", exact: true }).click()
          else await page.getByText("模拟登录", { exact: true }).filter({ visible: true }).click()
          let dialog = modal(admin ? "确认模拟登录" : "确认模拟用户身份")
          await dialog.getByText("Migration Alice (migration_alice)", { exact: true }).waitFor()
          await shot("impersonation-confirmation")
          await cancel(dialog)
          for (const self of [false, true]) {
            await rowMenu(self ? "migration_admin" : "migration_alice")
            if (admin) await page.getByRole("menuitem", { name: "修改密码", exact: true }).click()
            else await page.getByText("修改密码", { exact: true }).filter({ visible: true }).click()
            dialog = modal("修改密码")
            const password = (label, placeholder) =>
              admin
                ? dialog.getByLabel(`${label}*`, { exact: true })
                : dialog.getByPlaceholder(placeholder, { exact: true })
            if (self) await password("旧密码", "请输入旧密码").fill("old-value")
            else
              assert.equal(
                await (
                  admin
                    ? dialog.getByLabel("旧密码*", { exact: true })
                    : dialog.getByPlaceholder("请输入旧密码", { exact: true })
                ).count(),
                0,
              )
            await password("新密码", "请输入新密码").fill("Parity123")
            await password("确认密码", "请再次输入新密码").fill("Parity123")
            await shot(self ? "self-password" : "other-password")
            const beforePassword = s.writes.length
            await dialog.getByRole("button", { name: admin ? "确定" : "确认", exact: true }).click()
            await until(() => s.writes.length === beforePassword + 1)
            assert(s.writes.at(-1).resource.endsWith("/password"))
            assert.equal(typeof s.writes.at(-1).body.newPassword, "string")
            assert(s.writes.at(-1).body.newPassword.length > 100)
            assert.equal("oldPassword" in s.writes.at(-1).body, self)
            await dialog.waitFor({ state: "hidden" })
          }
          await userRow("parityalpha")
            .getByRole("button", { name: admin ? "Parity Edited的操作" : "更多操作", exact: true })
            .click()
          if (admin) await page.getByRole("menuitem", { name: "删除", exact: true }).click()
          else await page.getByText("删除", { exact: true }).filter({ visible: true }).last().click()
          let confirm = admin ? page.getByRole("alertdialog") : page.locator(".n-dialog").filter({ visible: true })
          await shot("single-delete-confirmation")
          await cancel(confirm)
          assert(s.rows.some((row) => row.id === created.id))
          await userRow("parityalpha")
            .getByRole("button", { name: admin ? "Parity Edited的操作" : "更多操作", exact: true })
            .click()
          if (admin) await page.getByRole("menuitem", { name: "删除", exact: true }).click()
          else await page.getByText("删除", { exact: true }).filter({ visible: true }).last().click()
          confirm = admin ? page.getByRole("alertdialog") : page.locator(".n-dialog").filter({ visible: true })
          await confirm.getByRole("button", { name: admin ? "删除" : "确认", exact: true }).click()
          await until(() => !s.rows.some((row) => row.id === created.id))
          await confirm.waitFor({ state: "hidden" })
          for (const name of ["migration_alice", "migration_pending"]) await userRow(name).getByRole("checkbox").click()
          await main.getByRole("button", { name: "批量删除", exact: true }).click()
          confirm = admin ? page.getByRole("alertdialog") : page.locator(".n-popconfirm").filter({ visible: true })
          await shot("batch-delete-confirmation")
          await confirm.getByRole("button", { name: "取消", exact: true }).click()
          await confirm.waitFor({ state: "hidden" })
          await main.getByRole("button", { name: "批量删除", exact: true }).click()
          confirm = admin ? page.getByRole("alertdialog") : page.locator(".n-popconfirm").filter({ visible: true })
          const beforeBatch = s.writes.length,
            batchIds = [
              s.rows.find((row) => row.username === "migration_alice").id,
              s.rows.find((row) => row.username === "migration_pending").id,
            ]
          await confirm.getByRole("button", { name: admin ? "删除" : "确认", exact: true }).click()
          await until(() => s.writes.length === beforeBatch + 1)
          assert.deepEqual(s.writes.at(-1).body.ids, batchIds)
          await confirm.waitFor({ state: "hidden" })
          checkpoint(
            "isolated user create/edit/pending3, validation, failure draft, resend, RSA self/other password, simulation confirmation and single/batch delete confirmation",
          )

          await panel()
            .getByRole("button", { name: admin ? "新增根部门" : "新增顶级部门", exact: true })
            .click()
          form = drawer("新增部门")
          await save(form)
          if (admin) await until(async () => (await form.locator('[data-invalid="true"]').count()) === 2)
          else await form.getByText("不能为空", { exact: true }).first().waitFor()
          const deptField = (label, placeholder) =>
            admin
              ? form.getByRole("textbox", { name: label, exact: true })
              : form.getByPlaceholder(placeholder, { exact: true })
          await deptField("部门名称", "请输入部门名称").fill("Parity Department")
          await deptField("部门编码", "请输入部门编码").fill("parity-department")
          await save(form)
          await form.waitFor({ state: "hidden" })
          const department = s.departments.find((row) => row.code === "parity-department")
          assert(department)
          await departmentMenu("Parity Department")
          if (admin) await page.getByRole("menuitem", { name: "编辑部门", exact: true }).click()
          else
            await page
              .locator(".n-dropdown-menu")
              .filter({ visible: true })
              .getByText("编辑部门", { exact: true })
              .click()
          form = drawer("编辑部门")
          await deptField("部门名称", "请输入部门名称").fill("Parity Department Edited")
          await save(form)
          await form.waitFor({ state: "hidden" })
          await departmentMenu("Parity Department Edited")
          if (admin) await page.getByRole("menuitem", { name: "删除", exact: true }).click()
          else await page.getByText("删除", { exact: true }).filter({ visible: true }).last().click()
          confirm = admin ? page.getByRole("alertdialog") : page.locator(".n-dialog").filter({ visible: true })
          await shot("department-delete-confirmation")
          await confirm.getByRole("button", { name: admin ? "删除" : "确认", exact: true }).click()
          await until(() => !s.departments.some((row) => row.id === department.id))
          await confirm.waitFor({ state: "hidden" })
          checkpoint("isolated department root create/edit/delete and required validation")
        } else {
          assert.equal(await main.getByRole("button", { name: "新增用户", exact: true }).count(), 0)
          assert.equal(await main.getByRole("button", { name: "编辑", exact: true }).count(), 0)
          assert.equal(await main.getByRole("columnheader", { name: /^(操作|Operate)$/ }).count(), 0)
          assert.equal(s.writes.length, 0)
          await userRow("migration_alice").getByText("m***@example.test", { exact: true }).waitFor()
          checkpoint("real read-only guest: no write actions, masked contact values and zero user/department writes")
        }

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
        english = true
        await page.setViewportSize({ width: 390, height: 844 })
        await main.getByRole("button", { name: admin ? "Show departments" : "Departments", exact: true }).waitFor()
        await shot("list-en-dark-390")
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        await main.getByRole("button", { name: admin ? "Show departments" : "Departments", exact: true }).click()
        await panel()
          .getByRole("textbox", { name: admin ? "Search departments" : "Search all departments", exact: true })
          .waitFor()
        await shot("directory-en-dark-390")
        if (account === "admin") {
          await main.getByRole("button", { name: admin ? "Add user" : "Add User", exact: true }).click()
          const form = drawer(admin ? "Add user" : "Add User")
          await form.waitFor()
          await shot("user-form-en-dark-390")
          if (admin) {
            const box = await form.boundingBox()
            assert(box.x >= 0 && box.x + box.width <= 391)
            assert(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          }
          await cancel(form)
          if (admin) {
            const selectedId = s.departments[0].id
            await panel().getByRole("button", { name: "Select Migration Dept 1", exact: true }).click()
            await until(() => s.lists.at(-1)?.departmentId === selectedId)
            assert.equal(await panel().count(), 0)
            let releaseDepartment
            s.departmentGate = new Promise((resolve) => {
              releaseDepartment = resolve
            })
            s.departments = []
            await main.getByRole("button", { name: "Add user", exact: true }).click()
            const draft = drawer("Add user")
            try {
              await draft.getByRole("textbox", { name: "Email", exact: true }).fill("mobile-draft@example.test")
            } finally {
              releaseDepartment()
            }
            await until(() => s.lists.at(-1)?.departmentId === undefined)
            await draft
              .getByRole("combobox", { name: "Department", exact: true })
              .filter({ hasText: "Unassigned" })
              .waitFor()
            assert.equal(
              await draft.getByRole("textbox", { name: "Email", exact: true }).inputValue(),
              "mobile-draft@example.test",
            )
            await shot("deleted-department-draft-390")
            await cancel(draft)
            await main.getByRole("heading", { name: "All users", exact: true }).waitFor()
            checkpoint(
              "mobile closed directory falls back after external department removal; open create draft retains email and clears inherited department",
            )
          }
        }
        checkpoint("English translations, dark theme and 390px directory/list/user drawer with target overflow checks")
        assert.deepEqual(s.handlerErrors, [])
        assert.deepEqual(errors, !admin && account === "admin" ? ["Array(3)", "Array(1)", "Array(2)"] : [])
        assert.deepEqual(consoleErrors, [])
        assert.deepEqual(failures, [])
        results.push({
          target,
          account,
          checks,
          errors,
          consoleErrors,
          failures,
          fixtureWrites: s.writes.map(({ method, resource }) => ({ method, resource })),
          realUserWrites: 0,
        })
      } catch (error) {
        await shot("failure").catch(() => {})
        results.push({
          target,
          account,
          checks,
          error: String(error),
          errors,
          consoleErrors,
          failures,
          handlerErrors: s.handlerErrors,
        })
        console.error(target, account, error)
      } finally {
        closing = true
        await context.close()
      }
    }
} finally {
  await browser.close()
}
await writeFile(new URL("user-browser-results.json", output), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
assert(results.every((result) => !result.error))
