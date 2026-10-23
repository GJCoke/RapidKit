import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { taskFixtures, taskPattern, taskName, workerName } from "./task-fixtures.mjs"
const output = new URL("../../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL("screenshots/task/", output)
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
          timezoneId: process.env.PARITY_TIMEZONE || "Asia/Shanghai",
          permissions: ["clipboard-read", "clipboard-write"],
        }),
        page = await context.newPage(),
        admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        fixture = taskFixtures(),
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
        row = (id) =>
          table()
            .getByRole("row")
            .filter({ hasText: taskName })
            .nth(id - 1),
        drawer = () =>
          admin
            ? page.getByRole("dialog", { name: /^(任务详情|Task Detail)$/ })
            : page.locator(".n-drawer-content:visible"),
        modal = () =>
          admin ? page.getByRole("dialog", { name: /^(触发任务|Trigger Task)$/ }) : page.locator(".n-modal:visible"),
        refresh = () => main.getByRole("button", { name: "刷新", exact: true }).first().click(),
        detail = async (index) => {
          await row(index).getByRole("button", { name: "详情", exact: true }).click()
          await drawer().getByText(`migration-task-${index}`, { exact: true }).first().waitFor()
        },
        closeDetail = async () => {
          if (admin) await drawer().locator('[data-slot="sheet-footer"] button').click()
          else await drawer().locator(".n-drawer-header__close").click()
          await drawer().waitFor({ state: "hidden" })
        },
        recordVisible = () => table().getByRole("row").filter({ hasText: taskName }).first().waitFor(),
        keyword = () =>
          admin
            ? main.getByRole("textbox", { name: "任务名称", exact: true })
            : main.getByPlaceholder("请输入任务名", { exact: true }),
        worker = () =>
          admin
            ? main.getByRole("textbox", { name: "Worker", exact: true })
            : main.getByPlaceholder("Worker", { exact: true })
      async function selectOption(trigger, text) {
        await trigger.click()
        if (admin) await page.getByRole("option", { name: text, exact: true }).filter({ visible: true }).last().click()
        else
          await page.locator(".n-base-select-option").filter({ hasText: text }).filter({ visible: true }).last().click()
      }
      const argumentValue = (group) =>
        admin
          ? group.getByRole("textbox", { name: "参数值", exact: true })
          : group.getByPlaceholder("参数值", { exact: true })
      const keywordKey = (group) =>
        admin
          ? group.getByRole("textbox", { name: "参数名称", exact: true })
          : group.getByPlaceholder("例如 verbose、options", { exact: true })
      async function submitTrigger() {
        if (admin) await modal().getByRole("button", { name: "确定", exact: true }).click()
        else await modal().getByRole("button", { name: "触发任务", exact: true }).click()
      }
      async function englishDark() {
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
          canTrigger = user.isAdmin || user.buttons.includes("task:trigger"),
          canRevoke = user.isAdmin || user.buttons.includes("task:revoke")
        console.log(
          target,
          account,
          "task permissions",
          user.buttons.filter((code) => code.startsWith("task:")),
        )
        const real = page.waitForResponse((response) =>
          /\/(?:api\/v1|proxy-default)\/tasks(?:\?|$)/.test(response.url()),
        )
        await page.goto(`${origin}/queue/task`)
        assert((await real).ok())
        await main.getByRole("button", { name: "执行记录", exact: true }).waitFor()
        checkpoint("real authenticated task list loads before fixtures")
        await page.route(taskPattern, fixture.handler)
        await page.reload()
        await recordVisible()
        assert.equal(s.queries.at(-1).pageSize, "20")
        assert.equal(new URL(page.url()).searchParams.get("range"), "7d")
        for (const text of ["等待中", "执行中", "成功", "失败", "重试中", "已撤销"]) {
          await table().getByText(text, { exact: true }).first().waitFor()
        }
        assert.equal(await main.getByRole("button", { name: "触发任务", exact: true }).count(), canTrigger ? 1 : 0)
        assert.equal(await table().getByRole("button", { name: "撤销任务", exact: true }).count(), canRevoke ? 2 : 0)
        await shot(page, target, account, "records-zh-light")
        checkpoint("all six statuses, columns, null runtime and permission actions")
        const before = s.queries.length
        await keyword().fill("migration")
        await worker().fill(workerName)
        assert.equal(s.queries.length, before)
        await main.getByRole("button", { name: "搜索", exact: true }).click()
        await until(() => s.queries.length > before)
        assert.equal(s.queries.at(-1).taskName, "migration")
        assert.equal(s.queries.at(-1).taskNameMatch, "contains")
        assert.equal(s.queries.at(-1).workerHostname, workerName)
        await recordVisible()
        // Group pagination/sort and both drill paths preserve the applied group state.
        await main.getByRole("button", { name: "任务汇总", exact: true }).click()
        await table().getByRole("button", { name: "6", exact: true }).waitFor()
        if (admin) await selectOption(main.getByRole("combobox", { name: "排序字段", exact: true }), "失败次数")
        else await selectOption(main.locator(".n-card").first().locator(".n-select").last(), "失败次数")
        await main.getByRole("button", { name: "降序", exact: true }).click()
        await main.getByRole("button", { name: "搜索", exact: true }).click()
        await until(() => s.groups.at(-1)?.sortBy === "failure" && s.groups.at(-1)?.sortOrder === "asc")
        await recordVisible()
        if (admin) await selectOption(main.getByRole("combobox", { name: "每页条数", exact: true }), "50 条/页")
        else {
          await main.locator(".n-pagination .n-select").click()
          await page
            .locator(".n-base-select-option")
            .filter({ hasText: /^50\s*\/\s*页$/ })
            .click()
        }
        await until(() => s.groups.at(-1)?.pageSize === "50")
        if (admin) await main.getByRole("button", { name: "下一页", exact: true }).click()
        else await main.locator(".n-pagination-item").getByText("2", { exact: true }).click()
        await until(() => s.groups.at(-1)?.page === "2" && new URL(page.url()).searchParams.get("groupPage") === "2")
        await shot(page, target, account, "groups-zh-light")
        await table().getByRole("button", { name: "1", exact: true }).last().click()
        await until(() => s.queries.at(-1)?.taskNameMatch === "exact" && s.queries.at(-1)?.status === "4")
        await recordVisible()
        assert.equal(new URL(page.url()).searchParams.get("task"), taskName)
        assert.equal(new URL(page.url()).searchParams.get("status"), "4")
        assert.equal(s.queries.at(-1).taskNameMatch, "exact")
        assert.equal(s.queries.at(-1).status, "4")
        assert.equal(new URL(page.url()).searchParams.get("groupPage"), "2")
        assert.equal(new URL(page.url()).searchParams.get("groupSize"), "50")
        assert(await keyword().isDisabled())
        await main.getByRole("button", { name: "返回任务汇总", exact: true }).click()
        await table().getByRole("button", { name: "6", exact: true }).waitFor()
        await table().getByRole("button", { name: "6", exact: true }).click()
        await recordVisible()
        assert.equal(new URL(page.url()).searchParams.get("status"), null)
        await main.getByRole("button", { name: "清除精确任务", exact: true }).click()
        await recordVisible()
        assert.equal(new URL(page.url()).searchParams.get("task"), null)
        await main.getByRole("button", { name: "重置", exact: true }).click()
        await recordVisible()
        checkpoint("draft/apply/group sort and failure/total drill preserve exact URL filters")
        // Detail: every result/argument/exception/log operation is a browser interaction.
        await detail(3)
        await drawer().getByText("1.23s", { exact: true }).waitFor()
        await drawer().getByText("返回值", { exact: true }).waitFor()
        await drawer().getByText("<script>literal</script>", { exact: false }).waitFor()
        const copyButtons = drawer().getByRole("button", { name: "复制", exact: true })
        await copyButtons.first().click()
        assert((await page.evaluate(() => navigator.clipboard.readText())).includes('"ok": true'))
        const jsonDownload = page.waitForEvent("download")
        await drawer().getByRole("button", { name: "下载 JSON", exact: true }).click()
        assert((await jsonDownload).suggestedFilename().endsWith("-result.json"))
        if (admin)
          await drawer()
            .getByRole("button", { name: /args\[5\]/ })
            .click()
        else
          await drawer()
            .getByRole("region", { name: "位置参数", exact: true })
            .locator(".argument-value")
            .filter({ has: page.getByText("[5]", { exact: true }) })
            .locator("summary")
            .first()
            .click()
        await drawer().getByText('"nested"', { exact: true }).waitFor()
        await drawer().getByText("Python 调用预览", { exact: true }).click()
        await shot(page, target, account, "detail-result")
        await closeDetail()
        await detail(4)
        await drawer().getByText("ValueError: <script>failed</script>", { exact: true }).waitFor()
        await drawer().getByRole("button", { name: "复制异常信息", exact: true }).click()
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "ValueError: <script>failed</script>")
        await drawer().getByText("堆栈信息", { exact: true }).first().click()
        const logs = admin
          ? drawer().getByRole("region", { name: "执行日志", exact: true })
          : drawer().locator(".log-viewer").last()
        await logs.getByRole("textbox", { name: "搜索日志内容", exact: true }).fill("finished")
        await logs.getByRole("button", { name: "复制", exact: true }).click()
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "finished")
        const logDownload = page.waitForEvent("download")
        await logs.getByRole("button", { name: "导出", exact: true }).click()
        assert((await logDownload).suggestedFilename().endsWith(".log"))
        await logs.getByRole("textbox", { name: "搜索日志内容", exact: true }).fill("missing")
        await logs.getByText("无匹配日志", { exact: true }).waitFor()
        assert(await logs.getByRole("button", { name: "导出", exact: true }).isDisabled())
        await shot(page, target, account, "detail-failure")
        await closeDetail()
        checkpoint("recursive Python args, JSON copy/download, exception/stack and log search/copy/export")
        // Detail failure is recoverable without exposing a previous task snapshot.
        s.failDetail = true
        const previousDetails = s.details.length
        await row(2).getByRole("button", { name: "详情", exact: true }).click()
        await until(() => s.details.length > previousDetails)
        if (admin) {
          await drawer().getByText("数据加载失败", { exact: true }).waitFor()
          s.failDetail = false
          await drawer().getByRole("button", { name: "重试", exact: true }).click()
          await drawer().getByText("migration-task-2", { exact: true }).first().waitFor()
        } else {
          await page.getByText("Task fixture failure", { exact: true }).last().waitFor()
          s.failDetail = false
          await closeDetail()
          await detail(2)
        }
        await closeDetail()
        checkpoint("detail load failure recovers without another task's old snapshot")
        if (canTrigger) {
          s.failRegistered = true
          const registrationCount = s.registrations
          await main.getByRole("button", { name: "触发任务", exact: true }).click()
          await until(() => s.registrations > registrationCount)
          if (admin) {
            await modal().getByText("无法加载已注册任务，请重试后再提交。", { exact: true }).waitFor()
            assert(await modal().getByRole("button", { name: "确定", exact: true }).isDisabled())
            s.failRegistered = false
            await modal().getByRole("button", { name: "重试", exact: true }).click()
          } else {
            await page.getByText("Task fixture failure", { exact: true }).last().waitFor()
            assert(await modal().getByRole("button", { name: "触发任务", exact: true }).isDisabled())
            await modal().getByRole("button", { name: "取消", exact: true }).click()
            s.failRegistered = false
            await main.getByRole("button", { name: "触发任务", exact: true }).click()
          }
          await until(() => s.registrations > registrationCount + 1)
          if (admin) {
            await submitTrigger()
            assert.equal(s.writes.length, 0)
          }
          const taskChoice = admin
            ? modal().getByRole("combobox", { name: "任务名称", exact: true })
            : modal().locator(".n-select").first()
          await selectOption(taskChoice, taskName)
          const args = modal().getByRole("region", { name: "位置参数", exact: true }),
            kwargs = modal().getByRole("region", { name: "关键字参数", exact: true })
          await args.getByRole("button", { name: "添加参数", exact: true }).click()
          await kwargs.getByRole("button", { name: "添加参数", exact: true }).click()
          await keywordKey(kwargs).fill("options")
          await argumentValue(kwargs).fill("literal")
          await argumentValue(args).fill("first")
          const typeChoice = () =>
            admin
              ? args.getByRole("combobox", { name: "值类型", exact: true }).first()
              : args.locator(".n-select").first()
          await selectOption(typeChoice(), "数字")
          await argumentValue(args).fill("9007199254740992")
          await args.getByRole("alert").waitFor()
          if (admin) assert(await modal().getByRole("button", { name: "确定", exact: true }).isDisabled())
          else await submitTrigger()
          assert.equal(s.writes.length, 0)
          await selectOption(typeChoice(), "布尔")
          await selectOption(
            admin ? args.getByRole("combobox", { name: "参数值", exact: true }) : args.locator(".n-select").last(),
            "False",
          )
          await selectOption(typeChoice(), "None")
          await args.getByText("Python 空值，无需填写内容", { exact: !admin }).waitFor()
          await selectOption(typeChoice(), "JSON")
          const jsonInput = args.locator("textarea")
          await jsonInput.fill("{invalid")
          await args.getByRole("alert").waitFor()
          await jsonInput.fill('[1, {"enabled": true}]')
          await args.getByRole("alert").waitFor({ state: "hidden" })
          if (admin) await modal().getByRole("tab", { name: "提交数据 · JSON", exact: true }).click()
          else await modal().getByText("提交数据 · JSON", { exact: true }).click()
          await selectOption(typeChoice(), "字符串")
          await argumentValue(args).fill("first")
          await args.getByRole("button", { name: "添加参数", exact: true }).click()
          await argumentValue(args).nth(1).fill("second")
          await args.getByRole("button", { name: "上移", exact: true }).nth(1).click()
          const handles = admin
            ? args.locator('[aria-roledescription="sortable"]')
            : args.locator(".argument-drag-handle")
          await handles.first().scrollIntoViewIfNeeded()
          const from = await handles.first().boundingBox(),
            to = await handles.nth(1).boundingBox()
          assert(from && to)
          await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
          await page.mouse.down()
          await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 })
          await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 30, { steps: 15 })
          await page.mouse.up()
          await until(async () => (await argumentValue(args).first().inputValue()) === "first")
          await args.getByRole("button", { name: "上移", exact: true }).nth(1).click()
          assert.equal(await argumentValue(args).first().inputValue(), "second")
          s.failWrite = true
          await submitTrigger()
          await until(() => s.writes.length === 1)
          if (admin) await modal().getByText("任务操作失败，请重试。", { exact: true }).waitFor()
          else await page.getByText("Task fixture failure", { exact: true }).last().waitFor()
          assert.equal(await argumentValue(args).first().inputValue(), "second")
          s.failWrite = false
          await submitTrigger()
          await modal().waitFor({ state: "hidden" })
          assert.deepEqual(s.writes.at(-1).body, {
            taskName,
            args: ["second", "first"],
            kwargs: { options: "literal" },
          })
          await recordVisible()
          checkpoint("registered trigger editor reorder, backend failure preservation and exact payload")
        }
        if (canRevoke) {
          await row(1).getByRole("button", { name: "撤销任务", exact: true }).click()
          if (admin) await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click()
          else await page.locator(".n-popconfirm:visible").getByRole("button", { name: "取消", exact: true }).click()
          const count = s.writes.length
          assert.equal(s.writes.length, count)
          await row(1).getByRole("button", { name: "撤销任务", exact: true }).click()
          if (admin) await page.getByRole("alertdialog").getByRole("button", { name: "确定", exact: true }).click()
          else await page.locator(".n-popconfirm:visible").getByRole("button", { name: "确认", exact: true }).click()
          await until(() => s.writes.length > count)
          await row(1).getByText("已撤销", { exact: true }).waitFor()
          checkpoint("revoke cancel/confirm only pending or started tasks")
        }
        // Pagination outside URL; refresh preserves page; search resets it.
        if (admin) await main.getByRole("button", { name: "下一页", exact: true }).click()
        else await main.locator(".n-pagination-item--button").last().click()
        await until(() => s.queries.at(-1)?.page === "2")
        const q = s.queries.length
        await refresh()
        await until(() => s.queries.length > q)
        assert.equal(s.queries.at(-1).page, "2")
        assert.equal(new URL(page.url()).searchParams.get("page"), null)
        await main.getByRole("button", { name: "搜索", exact: true }).click()
        await until(() => s.queries.at(-1)?.page === "1")
        await recordVisible()
        checkpoint("local record pagination, preset refresh preserves page, explicit search resets page")
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
        const count = s.queries.length
        await refresh()
        await until(() => s.queries.length > count)
        await shot(page, target, account, "loading")
        release()
        s.gate = null
        await recordVisible()
        s.failList = true
        await refresh()
        if (admin) {
          await main.getByText("数据加载失败", { exact: true }).waitFor()
          s.failList = false
          await main.getByRole("button", { name: "重试", exact: true }).click()
        } else {
          await page.getByText("Task fixture failure", { exact: true }).last().waitFor()
          s.failList = false
          await refresh()
        }
        await recordVisible()
        checkpoint("empty/loading/failure and retry restore data")
        // An explicit offset pair can represent the repeated DST hour. Custom refresh retains both instants.
        const customStart = "2026-11-01T01:30:00-04:00",
          customEnd = "2026-11-01T01:30:00-05:00"
        await page.goto(
          `${origin}/queue/task?view=records&range=custom&startTime=${encodeURIComponent(customStart)}&endTime=${encodeURIComponent(customEnd)}&foreign=keep`,
        )
        await until(
          () =>
            Date.parse(s.queries.at(-1)?.startTime) === Date.parse(customStart) &&
            Date.parse(s.queries.at(-1)?.endTime) === Date.parse(customEnd),
        )
        await recordVisible()
        const customCount = s.queries.length
        await refresh()
        await until(() => s.queries.length > customCount)
        assert.equal(Date.parse(s.queries.at(-1).endTime) - Date.parse(s.queries.at(-1).startTime), 3600000)
        assert.equal(new URL(page.url()).searchParams.get("foreign"), "keep")
        checkpoint("custom deep-link, DST-offset instants and refresh preserve the exact one-hour range")
        await englishDark()
        await page.setViewportSize({ width: 390, height: 844 })
        await main.getByRole("button", { name: "Execution records", exact: true }).waitFor()
        await shot(page, target, account, "records-en-dark-390")
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        await table()
          .getByRole("row")
          .filter({ hasText: taskName })
          .nth(3)
          .getByRole("button", { name: "Detail", exact: true })
          .click()
        await drawer().getByText("ValueError: <script>failed</script>", { exact: true }).waitFor()
        await shot(page, target, account, "detail-en-dark-390")
        if (admin) assert(await drawer().evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        await closeDetail()
        if (canTrigger) {
          const count = s.registrations
          await main.getByRole("button", { name: "Trigger Task", exact: true }).click()
          await until(() => s.registrations > count)
          await selectOption(
            admin
              ? modal().getByRole("combobox", { name: "Task Name", exact: true })
              : modal().locator(".n-select").first(),
            taskName,
          )
          await modal()
            .getByRole("region", { name: "Positional arguments", exact: true })
            .getByRole("button", { name: "Add argument", exact: true })
            .click()
          await modal()
            .getByRole("region", { name: "Keyword arguments", exact: true })
            .getByRole("button", { name: "Add argument", exact: true })
            .click()
          await shot(page, target, account, "trigger-en-dark-390")
          if (admin) {
            const box = await modal().boundingBox()
            assert(box && box.x >= 0 && box.x + box.width <= 391 && box.height <= 813)
            assert(await modal().evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          }
          await modal().getByRole("button", { name: "Cancel", exact: true }).click()
          await modal().waitFor({ state: "hidden" })
        }
        checkpoint("English dark theme 390px list, complete detail and editable trigger fit viewport")
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
          writes: s.writes.length,
          queries: s.queries.length,
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
  await writeFile(new URL("task-browser-results.json", output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
