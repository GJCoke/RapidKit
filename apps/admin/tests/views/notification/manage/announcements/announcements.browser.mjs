import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { announcementFixtures, fixturePattern } from "./announcement-fixtures.mjs"
const output = new URL("../../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL("screenshots/announcements/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
})
const results = []
async function shot(page, target, scene) {
  if (scene.includes("-en")) {
    await page.mouse.move(1, 1)
    const toast = page.locator(target === "admin" ? "[data-sonner-toast]" : ".n-message")
    if (await toast.count()) await toast.last().waitFor({ state: "hidden" })
  }
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  await page.screenshot({ path: fileURLToPath(new URL(`${target}-${scene}.png`, shots)), fullPage: true })
}
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          timezoneId: process.env.PARITY_TIMEZONE || "Asia/Shanghai",
        }),
        page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = [],
        failures = [],
        fixture = announcementFixtures(),
        checks = []
      if (process.env.PARITY_DST === "1") {
        const upcoming = fixture.rows.find((row) => row.status === "scheduled" && row.displayMode === "top_banner")
        upcoming.publishAt = "2030-11-03T06:30:00"
        upcoming.expireAt = "2030-11-03T06:45:00"
      }
      const originalUpcoming = structuredClone(
        fixture.rows.find((row) => row.status === "scheduled" && row.displayMode === "top_banner"),
      )
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      try {
        const admin = target === "admin",
          origin = `http://localhost:${admin ? 3100 : 9527}`,
          path = "/notification/manage/announcements"
        const main = page.locator("main")
        const editor = () =>
          admin
            ? page.getByRole("dialog", { name: /^(新建公告|编辑公告|复制公告)$/ })
            : page.locator(".n-drawer-content:visible").last()
        const confirmation = () =>
          admin
            ? page.getByRole("dialog", { name: "发布前核对", exact: true })
            : page.locator(".n-dialog:visible").last()
        const row = (title) => page.getByRole("row").filter({ hasText: title }).first()
        const refresh = async () => {
          await main.getByRole("button", { name: "刷新", exact: true }).click()
        }
        const openNew = async () => {
          await main.getByRole("button", { name: admin ? "新建公告" : "新增", exact: true }).click()
          await editor().getByRole("textbox", { name: "标题", exact: true }).waitFor()
          return editor()
        }
        const fill = async (title) => {
          await editor().getByRole("textbox", { name: "标题", exact: true }).fill(title)
          await editor().getByRole("textbox", { name: "正文", exact: true }).fill(`Body ${title}`)
        }
        const close = async () => {
          const panel = editor()
          await panel.getByRole("button", { name: "取消", exact: true }).click()
          await panel.waitFor({ state: "hidden" })
        }
        const more = async (title, action) => {
          await row(title).getByRole("button", { name: "更多", exact: true }).click()
          await (
            admin
              ? page.getByRole("menuitem", { name: action, exact: true })
              : page.locator(".n-dropdown-option").filter({ hasText: action })
          ).click()
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
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        if (account === "guest") {
          let announcementReads = 0
          page.on("request", (request) => {
            if (/\/(?:api\/v1|proxy-default)\/admin\/notifications(?:\?|$)/.test(request.url())) announcementReads++
          })
          await page.goto(`${origin}${path}`)
          if (admin) await page.getByRole("alertdialog", { name: "访问权限已变更", exact: true }).waitFor()
          else await page.waitForURL((url) => url.pathname === "/403")
          assert.equal(announcementReads, 0, "guest cannot fetch unauthorized announcement data")
          assert.equal(await main.getByRole("button", { name: /^(新增|新建公告|更多)$/ }).count(), 0)
          await shot(page, target, "guest-denied")
          if (admin) {
            await page
              .getByRole("alertdialog", { name: "访问权限已变更", exact: true })
              .getByRole("button", { name: "确定", exact: true })
              .click()
            await page.waitForURL((url) => url.pathname !== path)
            if (new URL(page.url()).pathname === "/403") {
              await page.getByRole("button", { name: "返回首页", exact: true }).click()
              await page.waitForURL((url) => url.pathname === "/home")
            }
          } else {
            await page.getByRole("button", { name: "返回首页", exact: true }).click()
            await page.waitForURL((url) => url.pathname === "/home")
          }
          if (admin) {
            await page.getByRole("button", { name: "切换语言", exact: true }).click()
            await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
            await page.keyboard.press("Escape")
            await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
            await page.locator("html.dark").waitFor()
          } else {
            await page
              .getByRole("button")
              .filter({ has: page.locator("svg.iconify--heroicons") })
              .hover()
            await page.getByText("English", { exact: true }).filter({ visible: true }).click()
            await page.locator("header button").nth(4).click()
            await page.locator("html.dark").waitFor()
          }
          await page.goto(`${origin}${path}`)
          if (admin) await page.getByRole("alertdialog", { name: "Access permissions changed", exact: true }).waitFor()
          else await page.waitForURL((url) => url.pathname === "/403")
          await shot(page, target, "guest-en-dark")
          await page.setViewportSize({ width: 390, height: 844 })
          await shot(page, target, "guest-en-dark-390")
          assert.equal(announcementReads, 0)
          assert.deepEqual(errors, [])
          assert.deepEqual(failures, [])
          results.push({
            target,
            account,
            status: "passed",
            checks: [
              "genuine guest login; unauthorized route blocks all announcement requests",
              "Chinese/English permission denial, recovery, dark theme and 390px",
            ],
            errors,
            failures,
          })
          console.log(target, account, "permission denial passed")
          continue
        }
        const real = page
          .waitForRequest(
            (request) =>
              /\/(?:api\/v1|proxy-default)\/admin\/notifications(?:\?|$)/.test(request.url()) &&
              new URL(request.frame().url()).pathname === path,
          )
          .then(async (request) => {
            const response = await request.response()
            assert(response)
            return response.json()
          })
        await page.goto(`${origin}${path}`)
        assert.equal((await real).code, 0, "real authenticated announcement list succeeds before fixtures")
        console.log(target, account, "checkpoint", checks.length + 1)
        checks.push("genuine login and real authorized list")
        await page.route(fixturePattern, fixture.handler)
        await refresh()
        await row("Parity draft").waitFor()
        if (account === "admin") {
          await shot(page, target, "list")
          // Filter by category/status/display, then restore all results.
          await (admin ? main.getByLabel("分类", { exact: true }) : main.getByPlaceholder("请输入分类")).fill(
            "system.security",
          )
          await main.getByRole("button", { name: "搜索", exact: true }).click()
          await page
            .getByText(admin ? "暂无数据" : "无数据", { exact: true })
            .first()
            .waitFor()
          assert.equal(fixture.lists.at(-1).category, "system.security")
          await main.getByRole("button", { name: "重置", exact: true }).click()
          await row("Parity draft").waitFor()
          if (admin) await select(main, "状态", "草稿")
          else {
            await main.locator(".n-base-selection").nth(0).click()
            await page.locator(".n-base-select-option").filter({ hasText: "草稿" }).click()
          }
          await main.getByRole("button", { name: "搜索", exact: true }).click()
          await row("Parity scheduled").waitFor({ state: "hidden" })
          assert.equal(fixture.lists.at(-1).status, "draft")
          await main.getByRole("button", { name: "重置", exact: true }).click()
          await row("Parity scheduled").waitFor()
          if (admin) await select(main, "展示方式", "顶部公告")
          else {
            await main.locator(".n-base-selection").nth(1).click()
            await page.locator(".n-base-select-option").filter({ hasText: "顶部公告" }).click()
          }
          await main.getByRole("button", { name: "搜索", exact: true }).click()
          await row("Parity draft").waitFor({ state: "hidden" })
          assert.equal(fixture.lists.at(-1).displayMode, "top_banner")
          await main.getByRole("button", { name: "重置", exact: true }).click()
          await row("Parity draft").waitFor()
          console.log(target, account, "checkpoint", checks.length + 1)
          checks.push("category/status/display filters and reset")
          await row("Parity draft").getByRole("button", { name: "详情", exact: true }).click()
          const detail = admin
            ? page.getByRole("dialog", { name: "公告详情", exact: true })
            : page.locator(".n-drawer-content:visible").last()
          await detail.getByText("Body of Parity draft", { exact: true }).waitFor()
          if (admin) assert.equal(Math.round((await detail.boundingBox()).width), 680)
          await shot(page, target, "detail")
          await page.keyboard.press("Escape")
          await detail.waitFor({ state: "hidden" })
          await openNew()
          if (admin) assert.equal(Math.round((await editor().boundingBox()).width), 840)
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor().getByText("请填写公告标题。", { exact: true }).waitFor()
          assert.equal(fixture.writes.length, 0)
          await fill("Parity new")
          fixture.failSave = 1
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor().getByText("保存失败，填写内容已保留，请稍后重试。", { exact: true }).waitFor()
          assert.equal(await editor().getByRole("textbox", { name: "标题", exact: true }).inputValue(), "Parity new")
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor().getByText("已存为草稿 · 尚未发布", { exact: true }).waitFor()
          await shot(page, target, "draft")
          await close()
          await row("Parity new").waitFor()
          await more("Parity new", "编辑")
          await editor().getByRole("textbox", { name: "标题", exact: true }).fill("Parity edited")
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor().getByText("已存为草稿 · 尚未发布", { exact: true }).waitFor()
          await close()
          await row("Parity edited").waitFor()
          console.log(target, account, "checkpoint", checks.length + 1)
          checks.push("detail, empty validation, backend error preservation, create and edit draft")
          await more("Parity scheduled", "复制公告")
          await editor().getByRole("textbox", { name: "标题", exact: true }).waitFor()
          assert.equal(
            await editor().getByRole("textbox", { name: "标题", exact: true }).inputValue(),
            "Parity scheduled",
          )
          assert.equal(
            await editor().locator('input[type="datetime-local"]').count(),
            0,
            "copy removes the saved schedule",
          )
          await fill("Parity copy")
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor().getByText("已存为草稿 · 尚未发布", { exact: true }).waitFor()
          await close()
          await row("Parity copy").waitFor()
          await more("Parity copy", "发布公告")
          await editor().getByRole("textbox", { name: "标题", exact: true }).waitFor()
          fixture.failPublish = 1
          await editor().getByRole("button", { name: "确认发布", exact: true }).click()
          await confirmation().getByRole("button", { name: "确认发布", exact: true }).click()
          await confirmation().getByText("发布失败，公告已保留为草稿，可重试发布。", { exact: true }).waitFor()
          const creates = fixture.writes.filter(
            (write) => write.method === "POST" && write.path === "/admin/notifications",
          ).length
          await confirmation().getByRole("button", { name: "确认发布", exact: true }).click()
          await editor().waitFor({ state: "hidden" })
          await row("Parity copy").getByText("已发布", { exact: true }).waitFor()
          assert.equal(
            fixture.writes.filter((write) => write.method === "POST" && write.path === "/admin/notifications").length,
            creates,
          )
          console.log(target, account, "checkpoint", checks.length + 1)
          checks.push("copy clears times and failed publication reuses persisted draft")
          for (const [title, action, status] of [
            ["Parity copy", "撤回通知", "已撤回"],
            ["Parity scheduled", "取消计划", "已取消"],
            ["Parity edited", "删除草稿", null],
          ]) {
            await more(title, action)
            const dialog = admin
              ? page.getByRole("alertdialog", { name: action, exact: true })
              : page.locator(".n-dialog:visible").last()
            await dialog.getByRole("button", { name: action, exact: true }).click()
            await dialog.waitFor({ state: "hidden" })
            if (status) await row(title).getByText(status, { exact: true }).waitFor()
            else await row(title).waitFor({ state: "hidden" })
          }
          console.log(target, account, "checkpoint", checks.length + 1)
          checks.push("recall/cancel/delete confirmations and refreshed row states")
          await openNew()
          await fill("Parity future")
          if (admin) await editor().getByRole("radio", { name: "定时发布", exact: true }).click()
          else await editor().locator(".n-radio").filter({ hasText: "定时发布" }).click()
          if (admin) await editor().getByLabel("定时发布时间", { exact: true }).fill("2030-10-23T15:00")
          else {
            const date = editor().locator(".n-date-picker input").first()
            await date.fill("2030-10-23 15:00:00")
            await date.press("Enter")
          }
          const writesBefore = fixture.writes.length
          await editor().getByRole("button", { name: "确认定时发布", exact: true }).click()
          await confirmation().getByRole("button", { name: "确认定时发布", exact: true }).click()
          await editor().waitFor({ state: "hidden" })
          await row("Parity future").getByText("待发布", { exact: true }).waitFor()
          const scheduled = fixture.writes.slice(writesBefore)
          assert.equal(scheduled.length, 1)
          assert.equal(scheduled[0].body.saveAsDraft, false)
          assert.equal(
            scheduled[0].body.publishAt,
            await page.evaluate(() => new Date("2030-10-23T15:00").toISOString().slice(0, 19)),
          )
          checks.push("scheduled publication uses UTC and does not call immediate publication")
          await more("Parity banner upcoming", "编辑")
          await editor().getByRole("textbox", { name: "标题", exact: true }).waitFor()
          assert(await editor().getByRole("button", { name: "存为草稿", exact: true }).isDisabled())
          if (admin) assert(await editor().getByRole("combobox", { name: "展示方式", exact: true }).isDisabled())
          else assert.equal((await editor().locator(".n-radio-button--disabled").count()) > 0, true)
          if (admin) {
            const scheduledTime = editor().getByLabel("定时发布时间", { exact: true })
            const expectedLocal = await page.evaluate((utc) => {
              const date = new Date(`${utc}Z`),
                pad = (value) => String(value).padStart(2, "0")
              return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
            }, originalUpcoming.publishAt)
            assert.equal(
              (await scheduledTime.inputValue()).slice(0, 16),
              expectedLocal,
              "UTC renders the correct local wall time",
            )
            const beforeEdit = fixture.writes.length
            await editor().getByRole("button", { name: "确认定时发布", exact: true }).click()
            await confirmation().getByRole("button", { name: "确认预约并覆盖", exact: true }).click()
            await editor().waitFor({ state: "hidden" })
            assert.equal(
              fixture.writes[beforeEdit].body.publishAt,
              originalUpcoming.publishAt,
              "unchanged schedule retains its UTC instant",
            )
            assert.equal(
              fixture.writes[beforeEdit].body.expireAt,
              originalUpcoming.expireAt,
              "unchanged expiry retains its UTC instant",
            )
          } else await close()
          await openNew()
          if (admin) await select(editor(), "展示方式", "顶部公告")
          else await editor().locator(".n-radio-button").filter({ hasText: "顶部公告" }).click()
          await fill("Parity replacement")
          fixture.conflict = 1
          await editor().getByRole("button", { name: "确认发布", exact: true }).click()
          await confirmation().getByText("新公告到期或下架后，被覆盖的旧公告不会自动恢复。", { exact: true }).waitFor()
          await confirmation()
            .getByText("已预约的待生效公告将保留，并在其开始时间覆盖届时的顶部公告。", { exact: true })
            .waitFor()
          await shot(page, target, "banner-confirmation")
          await confirmation().getByRole("button", { name: "确认覆盖并展示", exact: true }).click()
          await confirmation().waitFor({ state: "hidden" })
          await editor()
            .getByText("发布未完成，可能已有其他管理员更新公告。表单已保留，请重新核对状态并确认。", { exact: true })
            .waitFor()
          assert.equal(
            await editor().getByRole("textbox", { name: "标题", exact: true }).inputValue(),
            "Parity replacement",
          )
          await editor().getByRole("button", { name: "确认发布", exact: true }).click()
          await confirmation().getByRole("button", { name: "确认覆盖并展示", exact: true }).click()
          await editor().waitFor({ state: "hidden" })
          await row("Parity replacement").waitFor()
          const attempts = fixture.writes.filter((write) => write.body?.rawTitle === "Parity replacement")
          assert.equal(attempts.length, 2)
          assert.equal(attempts[0].body.clientRequestId, attempts[1].body.clientRequestId)
          assert.notEqual(attempts[0].body.bannerRevision, attempts[1].body.bannerRevision)
          assert.deepEqual(attempts[1].body.channels, [])
          assert.equal(attempts[1].body.mandatory, false)
          checks.push("registered banner restrictions and revision conflict retry preserve form and request identity")
          await openNew()
          if (admin) await select(editor(), "内容来源", "使用模板")
          else await editor().locator(".n-radio-button").filter({ hasText: "使用模板" }).click()
          if (admin) {
            await editor().getByRole("combobox", { name: "通知模板", exact: true }).click()
            await page.getByRole("option", { name: "Parity welcome · parity.welcome", exact: true }).click()
          } else {
            await editor().locator('.n-select[aria-label="通知模板"]').click()
            await page.locator(".n-base-select-option").filter({ hasText: "Parity welcome" }).click()
          }
          const variable = editor().getByRole("textbox", { name: "本次值 name", exact: true })
          await variable.waitFor()
          assert.equal(await variable.inputValue(), "", "template example is not an actual default")
          await variable.fill("Reader")
          await editor().getByText("Hello Reader", { exact: true }).waitFor()
          await editor().getByRole("button", { name: "预览人数", exact: true }).click()
          await editor().getByText("范围内共 2 人", { exact: true }).waitFor()
          await shot(page, target, "template-preview")
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor().getByText("已存为草稿 · 尚未发布", { exact: true }).waitFor()
          const templateWrite = fixture.writes.at(-1)
          assert.equal(templateWrite.body.templateCode, "parity.welcome")
          assert.deepEqual(templateWrite.body.templateVariables, { name: "Reader" })
          await close()
          checks.push("template selection, real values, local rendering and read-only audience estimate")

          await openNew()
          if (admin) await select(editor(), "内容来源", "多语言内容")
          else await editor().locator(".n-radio-button").filter({ hasText: "多语言内容" }).click()
          await editor().getByRole("textbox", { name: "zh-CN 标题", exact: true }).fill("公告 {system}")
          await editor().getByRole("textbox", { name: "zh-CN 正文", exact: true }).fill("中文正文")
          await editor().getByRole("textbox", { name: "本次值 system", exact: true }).fill("RapidKit")
          await editor().getByText("公告 RapidKit", { exact: true }).waitFor()
          await editor()
            .getByRole("tab", { name: /^English/ })
            .click()
          await editor().getByRole("textbox", { name: "en-US 标题", exact: true }).fill("Notice")
          const beforeLocal = fixture.writes.length
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor()
            .getByText("请补全 en-US 的标题和正文，或全部留空以使用默认语言。", { exact: true })
            .first()
            .waitFor()
          assert.equal(fixture.writes.length, beforeLocal)
          await editor().getByRole("textbox", { name: "en-US 正文", exact: true }).fill("Body {system}")
          await editor().getByRole("button", { name: "存为草稿", exact: true }).click()
          await editor().getByText("已存为草稿 · 尚未发布", { exact: true }).waitFor()
          assert.deepEqual(fixture.writes.at(-1).body.localizedContent.parameters, { system: "RapidKit" })
          await shot(page, target, "localized")
          await close()
          checks.push("localized language pairs, shared variables, preview and portable payload")

          await openNew()
          await fill("Parity action")
          await editor().getByText("高级设置（可选）", { exact: true }).click()
          if (admin) await select(editor(), "跳转类型", "系统菜单")
          else await editor().locator(".n-radio").filter({ hasText: "系统菜单" }).click()
          if (admin) {
            await editor().getByRole("combobox", { name: "系统菜单", exact: true }).click()
            await page.getByRole("option", { name: "Parity destination", exact: true }).click()
          } else {
            await editor().locator('.n-tree-select[aria-label="系统菜单"]').click()
            await page.locator(".n-tree-node-content").filter({ hasText: "Parity destination" }).click()
          }
          const actionQuery = editor().getByRole("textbox", { name: "查询参数 view", exact: true })
          assert.equal(await actionQuery.inputValue(), "summary")
          await editor().getByRole("button", { name: "验证目标", exact: true }).click()
          await editor().getByText("目标已验证", { exact: true }).waitFor()
          const popupCreated = context.waitForEvent("page")
          await editor().getByRole("button", { name: "打开页面验证", exact: true }).click()
          const popup = await popupCreated
          await popup.waitForURL((url) => url.pathname === "/home")
          assert.equal(new URL(popup.url()).searchParams.get("view"), "summary")
          await popup.close()
          await actionQuery.fill("details")
          assert(await editor().getByRole("button", { name: "打开页面验证", exact: true }).isDisabled())
          await shot(page, target, "action-editor")
          await close()
          checks.push("menu action defaults, server validation, new tab navigation and edit invalidation")
          await main.getByRole("button", { name: "列设置", exact: true }).click()
          const levelColumn = page.getByRole("checkbox", { name: "级别", exact: true })
          await levelColumn.click()
          assert.equal(await page.getByRole("columnheader", { name: "级别", exact: true }).count(), 0)
          await levelColumn.click()
          await page.keyboard.press("Escape")
          await page.getByRole("columnheader", { name: "级别", exact: true }).waitFor()
          checks.push("column visibility toggles restore the full table")
          const fixturePageSize = Number(fixture.lists.at(-1).pageSize)
          while (fixture.rows.length <= fixturePageSize) {
            const n = fixture.rows.length + 100
            fixture.rows.push({
              ...fixture.rows[0],
              id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
              title: `Parity extra ${n}`,
            })
          }
          const expanded = page.waitForResponse(
            (response) =>
              /\/admin\/notifications(?:\?|$)/.test(response.url()) && response.request().method() === "GET",
          )
          await refresh()
          await expanded
          assert(fixture.rows.length > fixturePageSize, "fixture spans the current page size")
          const nextPage = page.waitForResponse(
            (response) =>
              /\/admin\/notifications(?:\?|$)/.test(response.url()) &&
              new URL(response.url()).searchParams.get("page") === "2",
          )
          await (
            admin
              ? main.getByRole("button", { name: "下一页", exact: true })
              : main.locator(".n-pagination-item--button").last()
          ).click()
          await nextPage
          assert.equal(fixture.lists.at(-1).page, "2")
          await shot(page, target, "second-page")
          await (
            admin
              ? main.getByRole("button", { name: "上一页", exact: true })
              : main.locator(".n-pagination-item--button").first()
          ).click()
          await row("Parity draft").waitFor()
          checks.push("pagination sends the selected page and restores page one")

          // Controlled failure and loading leave the fixtures and account unchanged.
          fixture.empty = true
          await refresh()
          await page
            .getByText(admin ? "暂无数据" : "无数据", { exact: true })
            .first()
            .waitFor()
          await shot(page, target, "empty")
          fixture.empty = false
          await refresh()
          await row("Parity draft").waitFor()
          let release
          fixture.listGate = new Promise((resolve) => {
            release = resolve
          })
          const before = fixture.lists.length
          await refresh()
          for (let n = 0; fixture.lists.length === before && n < 100; n++)
            await new Promise((resolve) => setTimeout(resolve, 10))
          assert(fixture.lists.length > before, "loading request reached fixture boundary")
          await shot(page, target, "loading")
          const loadingCompleted = page.waitForResponse(
            (response) =>
              /\/admin\/notifications(?:\?|$)/.test(response.url()) && response.request().method() === "GET",
          )
          release()
          fixture.listGate = null
          await loadingCompleted
          fixture.failList = true
          const failure = page.waitForResponse(
            (response) =>
              /\/admin\/notifications(?:\?|$)/.test(response.url()) && response.request().method() === "GET",
          )
          await refresh()
          await failure
          await page
            .getByText(admin ? "数据加载失败" : "Parity backend failure", { exact: true })
            .first()
            .waitFor()
          await shot(page, target, "error")
          fixture.failList = false
          await main.getByRole("button", { name: admin ? "重试" : "刷新", exact: true }).click()
          await row("Parity draft").waitFor()
          checks.push("empty/loading/backend failure and successful retry")
        } else {
          assert.equal(await main.getByRole("button", { name: /^(新增|新建公告|更多)$/ }).count(), 0)
          await row("Parity draft").getByRole("button", { name: "详情", exact: true }).click()
          await page.getByText("Body of Parity draft", { exact: true }).waitFor()
          await page.keyboard.press("Escape")
          console.log(target, account, "checkpoint", checks.length + 1)
          checks.push("real guest grants allow read/detail and hide write/preview controls")
        }

        if (admin) {
          await page.getByRole("button", { name: "切换语言", exact: true }).click()
          await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
          await page.locator("html.dark").waitFor()
        } else {
          const language = page.getByRole("button").filter({ has: page.locator("svg.iconify--heroicons") })
          await language.hover()
          await page.getByText("English", { exact: true }).filter({ visible: true }).click()
          await page.locator("header button").nth(4).click()
          await page.locator("html.dark").waitFor()
        }
        await main.getByText("Announcements", { exact: true }).first().waitFor()
        await shot(page, target, `${account}-en-dark`)
        await page.setViewportSize({ width: 390, height: 844 })
        if (!admin) {
          const bounds = await main.boundingBox()
          if (bounds && bounds.x > 100) await page.locator("header button").first().click()
        }
        if (admin)
          await page.waitForFunction(() => Math.abs(document.querySelector("main").getBoundingClientRect().left) < 1)
        await shot(page, target, `${account}-en-dark-390`)
        if (admin)
          assert(
            await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth + 1),
            "page remains within the mobile viewport",
          )
        checks.push("English/dark theme and 390px layout")
        await shot(page, target, `${account}-development`)
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        results.push({
          target,
          account,
          status: "passed",
          checks,
          errors,
          failures,
          writes: fixture.writes.map((write) => ({ method: write.method, path: write.path })),
        })
        console.log(target, account, "passed", checks)
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
    new URL("reviews/announcements-browser-development.json", output),
    JSON.stringify(results, null, 2) + "\n",
  )
}
if (results.some((result) => result.status === "failed")) process.exitCode = 1
