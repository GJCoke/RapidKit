import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { templateFixtures, templatePattern } from "./template-fixtures.mjs"
const output = new URL("../../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/templates/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
  }),
  results = []
async function shot(page, target, scene) {
  await page.mouse.move(1, 1)
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  await page.screenshot({
    path: fileURLToPath(new URL(`${target}-${scene}.png`, shots)),
    fullPage: true,
    animations: "disabled",
    timeout: 30000,
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
        path = "/notification/manage/templates",
        fixture = templateFixtures(),
        checks = [],
        errors = [],
        failures = []
      page.setDefaultTimeout(15000)
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      const main = page.locator("main"),
        detail = page.getByRole("region", { name: "模板详情", exact: true }),
        editor = () =>
          admin
            ? page.getByRole("dialog", { name: /^(新增模板|编辑模板|New template|Edit template)$/ })
            : page.locator(".n-drawer-content:visible").last(),
        confirm = () =>
          admin
            ? page.getByRole("alertdialog", { name: "确定删除模板", exact: true })
            : page.locator(".n-dialog:visible").last()
      const checkpoint = (message) => {
        checks.push(message)
        console.log(target, account, "checkpoint", checks.length, message)
      }
      const select = async (scope, label, value) => {
        if (admin) {
          await scope.getByRole("combobox", { name: label, exact: true }).click()
          await page.getByRole("option", { name: value, exact: true }).click()
        } else {
          await scope.locator(`.n-select[aria-label="${label}"]`).click()
          await page.locator(".n-base-select-option").filter({ hasText: value }).click()
        }
      }
      const refresh = () => main.getByRole("button", { name: "刷新", exact: true }).click()
      const row = (name) => page.getByRole("row").filter({ hasText: name }).first()
      const choose = async (name) => {
        if (admin) await main.getByRole("button", { name: `查看模板：${name}`, exact: true }).click()
        else await page.getByRole("row", { name: `查看模板：${name}`, exact: true }).click()
        await detail.getByRole("heading", { name, exact: true }).waitFor()
        if (admin)
          assert(
            await main
              .getByRole("button", { name: `查看模板：${name}`, exact: true })
              .evaluate((element) => element === document.activeElement),
            "row selection preserves the focused name button",
          )
      }
      const close = async () => {
        const panel = editor()
        await panel.getByRole("button", { name: "取消", exact: true }).click()
        await panel.waitFor({ state: "hidden" })
      }
      const openNew = async () => {
        await main.getByRole("button", { name: "新增模板", exact: true }).click()
        await editor().getByRole("textbox", { name: "模板名称", exact: true }).waitFor()
      }
      const jsonInput = () => editor().getByRole("textbox", { name: admin ? "变量约束" : "JSON 编辑", exact: true })
      const toggleLanguageTheme = async () => {
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
        if (account === "guest") {
          let reads = 0
          page.on("request", (request) => {
            if (templatePattern.test(request.url())) reads++
          })
          await page.goto(`${origin}${path}`)
          if (admin) await page.getByRole("alertdialog", { name: "访问权限已变更", exact: true }).waitFor()
          else await page.waitForURL((url) => url.pathname === "/403")
          assert.equal(reads, 0)
          await shot(page, target, "guest-denied")
          if (admin) {
            await page.getByRole("alertdialog").getByRole("button", { name: "确定", exact: true }).click()
            await page.waitForURL((url) => url.pathname !== path)
          }
          if (new URL(page.url()).pathname === "/403") {
            await page.getByRole("button", { name: "返回首页", exact: true }).click()
            await page.waitForURL((url) => url.pathname === "/home")
          }
          await toggleLanguageTheme()
          await page.goto(`${origin}${path}`)
          if (admin) await page.getByRole("alertdialog", { name: "Access permissions changed", exact: true }).waitFor()
          else await page.waitForURL((url) => url.pathname === "/403")
          await shot(page, target, "guest-en-dark")
          await page.setViewportSize({ width: 390, height: 844 })
          await shot(page, target, "guest-en-dark-390")
          assert.equal(reads, 0)
          checkpoint("genuine guest denied, no API reads; recovery English/dark/390px")
        } else {
          const real = page
            .waitForResponse(
              (response) => templatePattern.test(response.url()) && response.request().method() === "GET",
            )
            .then((response) => response.json())
          await page.goto(`${origin}${path}`)
          assert.equal((await real).code, 0)
          checkpoint("genuine administrator login and real authorized list")
          await page.route(templatePattern, fixture.handler)
          await refresh()
          await row("Parity welcome").waitFor()
          await detail.getByText("Hello Ada", { exact: true }).waitFor()
          await shot(page, target, "list")
          await choose("Parity disabled")
          assert(await detail.getByText("强制通知，跳过分类接收偏好", { exact: true }).isVisible())
          await row("Parity welcome").focus()
          await page.keyboard.press("Space")
          await detail.getByRole("heading", { name: "Parity welcome", exact: true }).waitFor()
          checkpoint("master/detail selection, Space activation, saved examples and mandatory rules")
          await choose("Parity localized")
          await detail.getByText(admin ? "确定" : "确认", { exact: true }).waitFor()
          await detail.getByText("取消", { exact: true }).waitFor()
          await choose("Parity welcome")
          checkpoint("saved i18n template cannot override runtime options or language through variable names")

          await (
            admin
              ? main.getByRole("textbox", { name: "关键字", exact: true })
              : main.getByPlaceholder("搜索名称、编码或分类")
          ).fill("parity.disabled")
          await main.getByRole("button", { name: "搜索", exact: true }).click()
          await row("Parity welcome").waitFor({ state: "hidden" })
          assert.equal(fixture.lists.at(-1).keyword, "parity.disabled")
          await main.getByRole("button", { name: "重置", exact: true }).click()
          await row("Parity welcome").waitFor()
          await select(main, "启用状态", "已停用")
          await main.getByRole("button", { name: "搜索", exact: true }).click()
          await row("Parity welcome").waitFor({ state: "hidden" })
          assert.equal(fixture.lists.at(-1).enabled, "false")
          await main.getByRole("button", { name: "重置", exact: true }).click()
          await row("Parity welcome").waitFor()
          checkpoint("keyword and enabled=false filters, reset")
          await main.getByRole("button", { name: "列设置", exact: true }).click()
          const modeColumn = page.getByRole("checkbox", { name: "内容模式", exact: true })
          await modeColumn.click()
          assert.equal(await page.getByRole("columnheader", { name: "内容模式", exact: true }).count(), 0)
          await modeColumn.click()
          await page.keyboard.press("Escape")
          await page.getByRole("columnheader", { name: "内容模式", exact: true }).waitFor()
          checkpoint("column visibility toggles and restores the original columns")

          await openNew()
          await editor().getByRole("button", { name: "创建模板", exact: true }).click()
          await editor().getByText("请检查并填写上方标记的必填项。", { exact: true }).waitFor()
          assert.equal(fixture.writes.length, 0)
          for (const [label, value] of [
            ["模板名称", "Parity created"],
            ["模板编码", "parity.created"],
            ["标题模板", "Hello {name}"],
            ["正文模板", "Created body {name}"],
          ])
            await editor().getByRole("textbox", { name: label, exact: true }).fill(value)
          if (admin) await editor().getByRole("combobox", { name: "通知分类", exact: true }).fill("user.invited")
          else {
            await editor().locator('.n-select[aria-label="通知分类"]').click()
            await page.locator(".n-base-select-option").filter({ hasText: "user.invited" }).click()
          }
          await editor().getByRole("button", { name: "添加变量", exact: true }).click()
          await editor().getByRole("textbox", { name: "变量名 1", exact: true }).fill("name")
          await editor().getByRole("textbox", { name: "示例值 1", exact: true }).fill("Ada")
          const title = editor().getByRole("textbox", { name: "标题模板", exact: true })
          await title.fill("Hello WORLD!")
          await title.focus()
          await title.evaluate((element) => element.setSelectionRange(6, 11))
          await editor()
            .getByRole("button", { name: admin ? "{name}" : "name", exact: true })
            .click()
          assert.equal(await title.inputValue(), "Hello {name}!")
          await editor().getByText("Hello Ada!", { exact: true }).waitFor()
          await shot(page, target, "create-preview")
          await editor().getByRole("button", { name: "JSON 编辑", exact: true }).click()
          await jsonInput().fill("{")
          assert(
            await editor()
              .getByText(/请检查变量配置/)
              .first()
              .isVisible(),
          )
          await editor().getByRole("button", { name: "创建模板", exact: true }).click()
          assert.equal(fixture.writes.length, 0)
          await jsonInput().fill(
            '{"name":{"type":"string","required":true,"example":"Ada","default":"Reader","description":"Keep metadata"}}',
          )
          await editor().getByRole("button", { name: "表格编辑", exact: true }).click()
          fixture.failWrite = true
          await editor().getByRole("button", { name: "创建模板", exact: true }).click()
          await editor().getByText("保存失败，请检查配置后重试。已填写内容会保留。", { exact: true }).waitFor()
          assert.equal(
            await editor().getByRole("textbox", { name: "模板名称", exact: true }).inputValue(),
            "Parity created",
          )
          fixture.failWrite = false
          await editor().getByRole("button", { name: "创建模板", exact: true }).click()
          await editor().waitFor({ state: "hidden" })
          await row("Parity created").waitFor()
          assert.equal(fixture.writes.length, 2)
          assert.equal(fixture.writes[1].method, "POST")
          assert.deepEqual(fixture.writes[1].body.variableSchema.name, {
            type: "string",
            required: true,
            example: "Ada",
            default: "Reader",
            description: "Keep metadata",
          })
          checkpoint("empty validation, variables/JSON/insertion, safe preview and failed creation retry")
          await choose("Parity created")
          await detail.getByRole("button", { name: "编辑模板", exact: true }).click()
          assert(await editor().getByRole("textbox", { name: "模板编码", exact: true }).isDisabled())
          if (admin) assert(await editor().getByRole("combobox", { name: "内容模式", exact: true }).isDisabled())
          else {
            const radios = editor().locator('.n-radio-group[aria-label="内容模式"] input[type="radio"]')
            assert.equal(await radios.count(), 2)
            for (const radio of await radios.all()) assert(await radio.isDisabled())
          }
          await editor().getByRole("textbox", { name: "模板名称", exact: true }).fill("Parity edited")
          await editor().getByRole("button", { name: "JSON 编辑", exact: true }).click()
          assert.equal(JSON.parse(await jsonInput().inputValue()).name.default, "Reader")
          await editor().getByRole("button", { name: "表格编辑", exact: true }).click()
          await editor().getByRole("button", { name: "保存修改", exact: true }).click()
          await editor().waitFor({ state: "hidden" })
          await row("Parity edited").waitFor()
          const update = fixture.writes.at(-1)
          assert.equal(update.method, "PUT")
          assert(!("code" in update.body))
          assert(!("contentMode" in update.body))
          assert.equal(update.body.variableSchema.name.description, "Keep metadata")
          checkpoint("editing immutable code/mode and preserved schema extensions")
          await choose("Parity edited")
          await detail.getByRole("button", { name: "更多操作", exact: true }).click()
          await (
            admin
              ? page.getByRole("menuitem", { name: "删除", exact: true })
              : page.locator(".n-dropdown-option").filter({ hasText: "删除" })
          ).click()
          await confirm().waitFor()
          assert((await confirm().innerText()).includes("parity.created"))
          fixture.failDelete = true
          const deletedFailure = page.waitForResponse(
            (response) => templatePattern.test(response.url()) && response.request().method() === "DELETE",
          )
          await confirm().getByRole("button", { name: "删除", exact: true }).click()
          await deletedFailure
          assert(await confirm().isVisible())
          fixture.failDelete = false
          await confirm().getByRole("button", { name: "删除", exact: true }).click()
          await confirm().waitFor({ state: "hidden" })
          await row("Parity edited").waitFor({ state: "hidden" })
          checkpoint("delete confirmation, backend failure stays open and retries")
          await openNew()
          if (admin) await select(editor(), "内容模式", "国际化键")
          else await editor().getByText("国际化键", { exact: true }).click()
          await editor().getByRole("textbox", { name: "标题翻译键", exact: true }).fill("notification.missing.title")
          await editor().getByRole("textbox", { name: "正文翻译键", exact: true }).fill("notification.missing.body")
          await editor()
            .getByText(/当前语言未找到翻译/)
            .first()
            .waitFor()
          await shot(page, target, "i18n-preview")
          await close()
          checkpoint("i18n content mode and missing translation warnings")
          const seed = structuredClone(fixture.rows[0])
          for (let index = 0; index < 21; index++)
            fixture.rows.push({
              ...structuredClone(seed),
              id: `pad-${index}`,
              code: `pad.${index}`,
              name: `Parity padding ${index}`,
            })
          await refresh()
          await row("Parity padding 0").waitFor()
          if (admin) await main.getByRole("button", { name: "下一页", exact: true }).click()
          else await main.locator(".n-pagination-item--button").last().click()
          await row("Parity padding 20").waitFor()
          assert.equal(fixture.lists.at(-1).page, "2")
          await main.getByRole("button", { name: "重置", exact: true }).click()
          await row("Parity welcome").waitFor()
          checkpoint("pagination to second page and filter reset to first")
          fixture.empty = true
          await refresh()
          await page.getByText("暂无可查看的模板", { exact: true }).waitFor()
          await shot(page, target, "empty")
          fixture.empty = false
          let release
          fixture.gate = new Promise((resolve) => (release = resolve))
          const before = fixture.lists.length
          await refresh()
          for (let attempt = 0; fixture.lists.length === before && attempt < 100; attempt++)
            await new Promise((resolve) => setTimeout(resolve, 20))
          assert(fixture.lists.length > before)
          await shot(page, target, "loading")
          const completed = page.waitForResponse(
            (response) => templatePattern.test(response.url()) && response.request().method() === "GET",
          )
          fixture.gate = null
          release()
          await completed
          await row("Parity welcome").waitFor()
          fixture.failList = true
          await refresh()
          if (admin) await main.getByText("数据加载失败", { exact: true }).waitFor()
          else await page.getByText("Fixture failure", { exact: true }).first().waitFor()
          await shot(page, target, "failure-retry")
          fixture.failList = false
          if (admin) await main.getByRole("button", { name: "重试", exact: true }).click()
          else await refresh()
          await row("Parity welcome").waitFor()
          checkpoint("empty/loading/list failure and successful retry")
          await toggleLanguageTheme()
          await main.getByRole("heading", { name: "Templates", exact: true }).waitFor()
          await row("Parity localized").click()
          await page
            .getByRole("region", { name: "Template details", exact: true })
            .getByText("Confirm", { exact: true })
            .waitFor()
          await page
            .getByRole("region", { name: "Template details", exact: true })
            .getByText("Cancel", { exact: true })
            .waitFor()

          await shot(page, target, "admin-en-dark")
          await page.setViewportSize({ width: 390, height: 844 })
          if (!admin) {
            const bounds = await main.boundingBox()
            if (bounds && bounds.x > 100) await page.locator("header button").first().click()
          }
          if (admin)
            await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
          await shot(page, target, "admin-en-dark-390")
          await page.getByRole("region", { name: "Template details", exact: true }).scrollIntoViewIfNeeded()
          await shot(page, target, "detail-en-dark-390")

          if (admin) assert(await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth + 1))
          await main.getByRole("button", { name: "New template", exact: true }).click()
          await editor().getByRole("textbox", { name: "Template name", exact: true }).waitFor()
          await shot(page, target, "editor-en-dark-390")
          if (admin)
            assert(await page.getByRole("dialog").evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          await editor().getByRole("button", { name: "Cancel", exact: true }).click()
          checkpoint("English, dark theme and 390px list/detail/editor")
        }
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        results.push({ target, account, status: "passed", checks, errors, failures })
        console.log(target, account, "passed")
      } catch (error) {
        await shot(page, target, "failure")
        results.push({ target, account, status: "failed", message: String(error), checks, errors, failures })
        console.log(target, account, String(error), checks, errors, failures)
      } finally {
        await context.close()
      }
    }
} finally {
  await browser.close()
  await writeFile(
    new URL("reviews/templates-browser-development.json", output),
    JSON.stringify(results, null, 2) + "\n",
  )
}
if (results.some((result) => result.status === "failed")) process.exitCode = 1
