import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { scheduleFixtures, schedulePattern, taskName } from "./schedule-fixtures.mjs"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/schedule/", output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true }),
  results = []
async function until(check) {
  const deadline = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < deadline, "fixture condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
async function shot(page, target, account, scene) {
  await page.mouse.move(1, 1)
  await page.screenshot({
    path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
    fullPage: true,
    animations: "disabled",
  })
}
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          timezoneId: "America/New_York",
          permissions: ["clipboard-read", "clipboard-write"],
        }),
        page = await context.newPage(),
        admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        fixture = scheduleFixtures(),
        s = fixture.state,
        checks = [],
        errors = [],
        failures = [],
        consoleErrors = [],
        main = page.locator("main")
      page.setDefaultTimeout(15000)
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("requestfailed", (request) => {
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      const checkpoint = (text) => {
          checks.push(text)
          console.log(target, account, "checkpoint", checks.length, text)
        },
        table = () => main.getByRole("table").last(),
        row = (name) => table().getByRole("row").filter({ hasText: name }),
        visible = () => row("Migration schedule 1").waitFor(),
        drawer = () =>
          admin
            ? page.getByRole("dialog", { name: /^(新增定时任务|编辑定时任务|Add Scheduled Task|Edit Scheduled Task)$/ })
            : page.locator(".n-drawer-content:visible"),
        refresh = () => main.getByRole("button", { name: "刷新", exact: true }).first().click(),
        save = () =>
          drawer()
            .getByRole("button", { name: admin ? "保存" : "确认", exact: true })
            .click(),
        close = async () => {
          await drawer()
            .getByRole("button", { name: /^(取消|Cancel)$/ })
            .click()
          await drawer().waitFor({ state: "hidden" })
        },
        kind = (text) =>
          drawer()
            .getByRole("group", { name: "调度计划", exact: true })
            .getByRole("button", { name: text, exact: true }),
        name = () =>
          admin
            ? drawer().getByRole("textbox", { name: "任务名称", exact: true })
            : drawer().getByPlaceholder("请输入任务名称", { exact: true }),
        search = () =>
          admin
            ? main.getByRole("textbox", { name: "Celery 任务", exact: true })
            : main.getByPlaceholder("请选择 Celery 任务", { exact: true })
      async function select(trigger, text) {
        await trigger.click()
        if (admin) await page.getByRole("option", { name: text, exact: true }).filter({ visible: true }).last().click()
        else
          await page.locator(".n-base-select-option").filter({ hasText: text }).filter({ visible: true }).last().click()
      }
      async function chooseTask() {
        await select(
          admin
            ? drawer().getByRole("combobox", { name: "Celery 任务", exact: true })
            : drawer().locator(".n-select").first(),
          taskName,
        )
      }
      async function openCreate() {
        const n = s.registrations
        await main.getByRole("button", { name: admin ? "新增定时任务" : "新增", exact: true }).click()
        await until(() => s.registrations > n)
        await name().waitFor()
        if (admin) {
          const box = await drawer().boundingBox()
          assert(
            box && Math.abs(box.width - Math.min(640, page.viewportSize().width)) <= 1,
            `drawer width ${box?.width}`,
          )
        }
      }
      async function edit(name) {
        const response = page.waitForResponse(
          (response) =>
            /\/(?:api\/v1|proxy-default)\/schedules\/[^/?]+$/.test(response.url()) &&
            response.request().method() === "GET",
        )
        await row(name).getByRole("button", { name: "编辑", exact: true }).click()
        await response
        await drawer().waitFor()
        if (!s.failDetail) await drawer().locator("input").first().waitFor()
      }
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        const token = await page.evaluate(
            (admin) =>
              admin
                ? localStorage.getItem("accessToken")
                : JSON.parse(localStorage.getItem("RAPIDKIT_token") || "null"),
            admin,
          ),
          profile = await page.request.get("http://localhost:16000/api/v1/auth/user/info", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          user = (await profile.json()).data,
          canCreate = user.isAdmin || user.buttons.includes("schedule:create"),
          canUpdate = user.isAdmin || user.buttons.includes("schedule:update"),
          canDelete = user.isAdmin || user.buttons.includes("schedule:delete")
        const real = page.waitForResponse((response) =>
          /\/(?:api\/v1|proxy-default)\/schedules(?:\?|$)/.test(response.url()),
        )
        await page.goto(`${origin}/queue/schedule`)
        assert((await real).ok())
        checkpoint("real authenticated schedule list before isolated fixture writes")
        await page.route(schedulePattern, fixture.handler)
        await page.reload()
        await visible()
        assert.equal(
          await main.getByRole("button", { name: admin ? "新增定时任务" : "新增", exact: true }).count(),
          canCreate ? 1 : 0,
        )
        assert.equal(await table().getByRole("button", { name: "编辑", exact: true }).count(), canUpdate ? 3 : 0)
        assert.equal(await table().getByRole("button", { name: "删除", exact: true }).count(), canDelete ? 3 : 0)
        await shot(page, target, account, "list-zh-light")
        checkpoint("three schedule kinds, all columns and permissions")
        await main.getByRole("button", { name: "列设置", exact: true }).click()
        const detailColumn = page.getByRole("checkbox", { name: "调度详情", exact: true })
        await detailColumn.click()
        assert.equal(await main.getByRole("columnheader", { name: "调度详情", exact: true }).count(), 0)
        await detailColumn.click()
        await page.keyboard.press("Escape")
        await main.getByRole("columnheader", { name: "调度详情", exact: true }).waitFor()
        checkpoint("column settings hide and restore schedule detail")
        const before = s.queries.length
        await search().fill("scheduled")
        assert.equal(s.queries.length, before)
        await main.getByRole("button", { name: "搜索", exact: true }).first().click()
        await until(() => s.queries.length > before)
        assert.equal(s.queries.at(-1).taskName, "scheduled")
        await visible()
        const resetCount = s.queries.length
        await main.getByRole("button", { name: "重置", exact: true }).click()
        assert.equal(s.queries.length, resetCount)
        await refresh()
        await until(() => s.queries.length > resetCount)
        assert(!s.queries.at(-1).taskName)
        await visible()
        await select(
          admin
            ? main.getByRole("combobox", { name: "启用状态", exact: true })
            : main.locator(".n-card").first().locator(".n-select").first(),
          "禁用",
        )
        await main.getByRole("button", { name: "搜索", exact: true }).first().click()
        await until(() => s.queries.at(-1).enabled === "false")
        await row("Migration schedule 2").waitFor()
        await main.getByRole("button", { name: "重置", exact: true }).click()
        await main.getByRole("button", { name: "搜索", exact: true }).first().click()
        await visible()
        checkpoint("task and false-enabled filtering, draft-only reset and refresh")
        if (admin) await main.getByRole("button", { name: "下一页", exact: true }).click()
        else await main.locator(".n-pagination-item").getByText("2", { exact: true }).click()
        await until(() => s.queries.at(-1)?.page === "2")
        await visible()
        assert.equal((await row("Migration schedule 1").getByRole("cell").first().innerText()).trim(), "1")
        const refreshCount = s.queries.length
        await refresh()
        await until(() => s.queries.length > refreshCount)
        assert.equal(s.queries.at(-1).page, "2")
        await main.getByRole("button", { name: "搜索", exact: true }).first().click()
        await until(() => s.queries.at(-1)?.page === "1")
        await visible()
        checkpoint("page-local ordinals, next page, refresh retains page, Search resets page")
        if (canCreate) {
          await openCreate()
          await save()
          assert.equal(s.writes.length, 0)
          await name().fill("Migration new")
          await chooseTask()
          const countInput = () => drawer().locator('input[aria-label="间隔数量"]')
          await countInput().fill("")
          await save()
          assert.equal(s.writes.length, 0)
          await countInput().fill("15")
          await select(
            admin
              ? drawer().getByRole("combobox", { name: "时间单位", exact: true })
              : drawer().locator('.n-select[aria-label="时间单位"]'),
            "微秒",
          )
          await until(() => s.previews.at(-1)?.period === "microseconds")
          await drawer().getByText("2026-11-01 01:30:00.123456", { exact: true }).first().waitFor()
          await shot(page, target, account, "interval-microseconds")
          s.failWrite = true
          await save()
          await until(() => s.writes.length === 1)
          await name().waitFor()
          assert.equal(await name().inputValue(), "Migration new")
          s.failWrite = false
          await save()
          await drawer().waitFor({ state: "hidden" })
          assert.equal(s.rows.at(-1).schedule.period, "microseconds")
          checkpoint(
            "required/invalid interval validation, precise timezone preview, failed-create preservation and successful payload",
          )
        }
        if (canUpdate) {
          await edit("Migration schedule 2")
          const expr = () => drawer().locator('textarea[aria-label="Crontab 表达式"]')
          await expr().waitFor()
          assert.equal(await expr().inputValue(), "00 09 * jan mon-fri")
          await expr().fill("99 0 * * *")
          const writes = s.writes.length
          await save()
          await until(() => s.previews.at(-1)?.minute === "99")
          assert.equal(s.writes.length, writes)
          await kind("固定间隔").click()
          await kind("日历计划").click()
          assert.equal(await expr().inputValue(), "99 0 * * *")
          await expr().fill("30 9 * * 1-5")
          await drawer().getByRole("button", { name: "每周", exact: true }).click()
          await drawer().getByRole("button", { name: "周末", exact: true }).click()
          await until(() => s.previews.at(-1)?.dayOfWeek === "0,6")
          await shot(page, target, account, "crontab-weekly")
          await drawer().getByRole("button", { name: "每小时", exact: true }).click()
          await select(
            admin
              ? drawer().getByRole("combobox", { name: "每小时的第几分钟", exact: true })
              : drawer().locator('.n-select[aria-label="每小时的第几分钟"]'),
            "07",
          )
          await until(() => s.previews.at(-1)?.minute === "7" && s.previews.at(-1)?.hour === "*")
          await drawer()
            .getByRole("group", { name: "调度周期", exact: true })
            .getByRole("button", { name: "每天", exact: true })
            .click()
          const timeInput = admin ? drawer().locator('input[type="time"]') : drawer().locator(".n-time-picker input")
          await timeInput.fill("13:45")
          await timeInput.press("Tab")
          await until(() => s.previews.at(-1)?.hour === "13" && s.previews.at(-1)?.minute === "45")
          await drawer().getByRole("button", { name: "每月", exact: true }).click()
          await drawer().getByRole("button", { name: "每月 31 日", exact: true }).click()
          await until(() => s.previews.at(-1)?.dayOfMonth?.split(",").includes("31"))
          await drawer().getByRole("button", { name: "每 N 分钟", exact: true }).click()
          await select(
            admin
              ? drawer().getByRole("combobox", { name: "执行频率", exact: true })
              : drawer().locator('.n-select[aria-label="执行频率"]'),
            "每 5 分钟",
          )
          await until(() => s.previews.at(-1)?.minute === "*/5")
          await drawer().getByRole("button", { name: "每周", exact: true }).click()
          await until(() => s.previews.at(-1)?.dayOfWeek === "0,6")
          await save()
          await drawer().waitFor({ state: "hidden" })
          assert.equal(s.rows[1].schedule.dayOfWeek, "0,6")
          checkpoint(
            "lossless advanced Cron edit, server-only semantic rejection, invalid draft retention and weekly update",
          )
          await edit("Migration schedule 3")
          await drawer().locator('input[aria-label="纬度"]').waitFor()
          const preciseWrites = s.writes.length
          await save()
          await drawer().waitFor({ state: "hidden" })
          assert.equal(s.writes.length, preciseWrites + 1)
          assert.equal(s.rows[2].schedule.latitude, 31.23041234)
          assert.equal(s.rows[2].schedule.longitude, 121.47371234)
          await edit("Migration schedule 3")
          await drawer().locator('input[aria-label="纬度"]').fill("")
          await save()
          const solarWrites = s.writes.length
          await drawer().locator('input[aria-label="纬度"]').fill("-33.8688")
          await drawer().locator('input[aria-label="经度"]').fill("151.2093")
          await select(
            admin
              ? drawer().getByRole("combobox", { name: "天文事件", exact: true })
              : drawer().locator('.n-select[aria-label="天文事件"]'),
            "太阳中天",
          )
          await shot(page, target, account, "solar-coordinates")
          await save()
          await drawer().waitFor({ state: "hidden" })
          assert.equal(s.writes.length, solarWrites + 1)
          assert.deepEqual(s.rows[2].schedule, {
            type: "solar",
            event: "solar_noon",
            latitude: -33.8688,
            longitude: 151.2093,
          })
          await row("Migration schedule 1").getByRole("switch").click()
          await until(() => s.rows[0].enabled === false)
          await visible()
          checkpoint("solar event and finite coordinates validation/update plus toggle without body")
          if (admin) {
            s.detailOverrides[s.rows[0].id] = { enabled: true, description: "Fresh detail snapshot" }
            await edit("Migration schedule 1")
            assert.equal(
              await drawer().getByRole("textbox", { name: "描述", exact: true }).inputValue(),
              "Fresh detail snapshot",
            )
            assert.equal(
              await drawer().getByRole("switch", { name: "启用状态", exact: true }).getAttribute("aria-checked"),
              "true",
            )
            await save()
            await drawer().waitFor({ state: "hidden" })
            assert.equal(s.rows[0].enabled, true)
            assert.equal(s.rows[0].description, "Fresh detail snapshot")
            s.detailOverrides = {}
            checkpoint("fresh full detail metadata supersedes stale list snapshot at first edit initialization")
          }
          s.failDetail = true
          await edit("Migration schedule 1")
          await drawer()
            .getByRole("button", { name: admin ? "保存" : "确认", exact: true })
            .isDisabled()
            .then((value) => assert(value))
          await shot(page, target, account, "detail-failure")
          await close()
          s.failDetail = false
          await edit("Migration schedule 1")
          await name().waitFor()
          await close()
          s.failPreview = true
          await edit("Migration schedule 1")
          await drawer().getByText("无法获取执行预览，请刷新重试；校验成功后才能保存。", { exact: true }).waitFor()
          const previewWrites = s.writes.length
          await save()
          assert.equal(s.writes.length, previewWrites)
          s.failPreview = false
          await drawer().getByRole("button", { name: "刷新预览", exact: true }).click()
          await drawer().getByText("2026-11-01 01:30:00", { exact: true }).first().waitFor()
          await close()
          s.failRegistered = true
          await openCreate()
          await shot(page, target, account, "registered-failure")
          if (admin) assert(await drawer().getByRole("button", { name: "保存", exact: true }).isDisabled())
          await close()
          s.failRegistered = false
          checkpoint("detail failure blocks submit; close/reopen recovers; registration failure cannot create")
        }
        if (canDelete && canCreate) {
          await row("Migration new").getByRole("button", { name: "删除", exact: true }).click()
          if (admin) await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).click()
          else await page.locator(".n-popconfirm").getByRole("button", { name: "确认", exact: true }).click()
          await until(() => !s.rows.some((row) => row.name === "Migration new"))
          checkpoint("single-row delete confirmation removes only created fixture")
        }
        // Task destination must perform the actual authorized GET with exact task filtering.
        const taskResponse = page.waitForResponse((response) =>
          /\/(?:api\/v1|proxy-default)\/tasks\?/.test(response.url()),
        )
        await row("Migration schedule 1").getByRole("button", { name: "Migration schedule 1", exact: true }).click()
        const response = await taskResponse,
          q = new URL(response.url()).searchParams
        assert(response.ok())
        assert.equal(q.get("taskName"), taskName)
        assert.equal(q.get("taskNameMatch"), "exact")
        assert.equal(new URL(page.url()).searchParams.get("range"), "7d")
        await page.goto(`${origin}/queue/schedule`)
        await visible()
        checkpoint("schedule name navigates to real task records with exact name and seven-day range")
        s.empty = true
        await refresh()
        await main
          .getByText(admin ? "暂无数据" : "无数据", { exact: true })
          .first()
          .waitFor()
        await shot(page, target, account, "empty")
        s.empty = false
        let release
        const gate = new Promise((resolve) => {
          release = resolve
        })
        s.gate = gate
        const loading = s.queries.length
        await refresh()
        await until(() => s.queries.length > loading)
        await shot(page, target, account, "loading")
        release()
        s.gate = null
        await visible()
        s.failList = true
        await refresh()
        if (admin) {
          await main.getByText("数据加载失败", { exact: true }).waitFor()
          s.failList = false
          await main.getByRole("button", { name: "重试", exact: true }).click()
        } else {
          await page.getByText("Schedule fixture failure", { exact: true }).last().waitFor()
          s.failList = false
          await refresh()
        }
        await visible()
        checkpoint("empty/loading/error and retry states")
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
        await main.getByText("Scheduled Tasks", { exact: true }).first().waitFor()
        await shot(page, target, account, "list-en-dark-390")
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        if (canCreate) {
          await main.getByRole("button", { name: admin ? "Add Scheduled Task" : "Add", exact: true }).click()
          for (const text of ["Fixed interval", "Calendar", "Solar event"]) {
            await drawer()
              .getByRole("group", { name: "Schedule", exact: true })
              .getByRole("button", { name: text, exact: true })
              .click()
            await shot(page, target, account, `${text.split(" ")[0]}-en-dark-390`)
            if (admin) assert(await drawer().evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          }
          await close()
        }
        checkpoint("English dark theme 390px list and all three editable schedule kinds fit")
        assert.deepEqual(errors, !admin && canCreate ? ["Array(2)"] : [])
        assert.deepEqual(failures, [])
        assert.deepEqual(consoleErrors, [])
        results.push({ target, account, checks, errors, failures, consoleErrors, writes: s.writes.length })
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
  await writeFile(new URL("schedule-browser-results.json", output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
