import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { homeFixtures, homePattern, capabilities, activity, resource, failure } from "./home-fixtures.mjs"
const report = new URL("../../../../../docs/superpowers/reports/admin-migration/", import.meta.url),
  shots = new URL(`screenshots/home/${process.env.PARITY_RUN || "development"}/`, report)
await mkdir(shots, { recursive: true })
const zh = JSON.parse(
  await readFile(new URL("../../../../frontend/src/locales/langs/zh-CN/page.json", import.meta.url)),
).home.dashboard
const en = JSON.parse(
  await readFile(new URL("../../../../frontend/src/locales/langs/en-US/page.json", import.meta.url)),
).home.dashboard
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true }),
  results = []
async function until(check) {
  const end = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < end, "home condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}
try {
  for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`,
        context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          timezoneId: "Asia/Shanghai",
          permissions: ["clipboard-read", "clipboard-write"],
        }),
        page = await context.newPage(),
        main = page.locator("main"),
        fixture = homeFixtures(),
        state = fixture.state,
        errors = [],
        errorStages = [],
        failures = [],
        consoleErrors = [],
        checks = [],
        sockets = []
      let english = false,
        closing = false
      page.setDefaultTimeout(15000)
      page.on("pageerror", (error) => {
        errors.push(error.message)
        errorStages.push(checks.length)
        console.log("HOME_PAGE_ERROR", target, account, "after checkpoint", checks.length, error.stack)
      })
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("requestfailed", (request) => {
        if (!closing && request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      await page.routeWebSocket(/\/socket\.io\//, (socket) => {
        const server = socket.connectToServer()
        server.onMessage((data) => {
          const value = String(data)
          if (value.startsWith("40/dashboard,")) sockets.push(socket)
          if (
            state.active &&
            value.startsWith("42/dashboard,") &&
            /"dashboard:(?:resources|activity.created|api_stats)"/.test(value)
          )
            return
          socket.send(data)
        })
      })
      const t = (key, params = {}) => {
        let value = key.split(".").reduce((value, part) => value[part], english ? en : zh)
        for (const [key, replacement] of Object.entries(params))
          value = value.replaceAll(`{${key}}`, String(replacement))
        return value
      }
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
      const card = (key) =>
        admin
          ? main.getByRole("region", { name: t(key), exact: true })
          : key === "recentActivity"
            ? main.locator(".activity-card")
            : main
                .locator(".n-card")
                .filter({ has: page.getByText(t(key), { exact: true }) })
                .first()
      const title = (id) => t("activity.taskSucceeded", { task: id, duration: 1.24 })
      const go = async () => {
        sockets.length = 0
        await page.goto(`${origin}/home`)
      }
      const emit = async (name, payload) => {
        await until(() => sockets.length > 0)
        sockets.at(-1).send(`42/dashboard,${JSON.stringify([name, payload])}`)
      }
      const dialog = (key) =>
        admin
          ? page.getByRole("dialog", { name: t(key), exact: true })
          : page
              .locator(".n-drawer-content:visible")
              .filter({ has: page.locator(".n-drawer-header__main").getByText(t(key), { exact: true }) })
      const close = async (key) => {
        const current = dialog(key)
        if (admin) await current.getByRole("button", { name: english ? "Cancel" : "取消", exact: true }).click()
        else await current.locator(".n-drawer-header__close").click()
        await current.waitFor({ state: "hidden" })
      }
      async function settleSourceCharts() {
        if (admin || account !== "admin") return
        await until(async () => (await main.locator("canvas").count()) >= 3)
        let previous = "",
          stableSince = Date.now()
        await until(async () => {
          const signature = await main
            .locator("canvas")
            .evaluateAll((nodes) => nodes.map((node) => node.toDataURL()).join("|"))
          if (signature !== previous) {
            previous = signature
            stableSince = Date.now()
            return false
          }
          return Date.now() - stableSince >= 300
        })
      }
      async function ensureDark() {
        const current = admin ? main.locator(".bg-card").first() : main.locator(".n-card").first()
        const dark = () =>
          current.evaluate((element) => {
            const value = getComputedStyle(element).backgroundColor,
              number = Number(value.match(/[\d.]+/)?.[0])
            return value.startsWith("oklch") ? number < 0.5 : number < 128
          })
        if (!(await dark())) {
          if (admin) await page.getByRole("button", { name: "Toggle theme", exact: true }).click()
          else
            await page
              .getByRole("button")
              .filter({ has: page.locator("svg.iconify--material-symbols") })
              .click()
        }
        await page.locator("html.dark").waitFor()
        await until(dark)
      }
      try {
        await page.goto(`${origin}/login`)
        await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
        await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        const credentials = await page.evaluate(
          (admin) =>
            admin ? localStorage.getItem("accessToken") : JSON.parse(localStorage.getItem("RAPIDKIT_token") || "null"),
          admin,
        )
        const real = await page.request.get("http://localhost:16000/api/v1/dashboard/capabilities", {
            headers: { Authorization: `Bearer ${credentials}` },
          }),
          realBody = await real.json()
        assert.equal(realBody.code, 0)
        await main
          .getByText(realBody.data.allowedModules.length ? t("operationsOverview") : t("permission.title"), {
            exact: true,
          })
          .waitFor()
        await shot("real-home")
        checkpoint("real existing account login, authenticated capabilities and actual home before fixtures")
        state.allowed = account === "admin" ? [...capabilities] : []
        state.active = true
        await page.route(homePattern, fixture.handler)
        await go()
        if (account === "admin") {
          await card("operationsOverview").getByText("95.00%", { exact: true }).waitFor()
          for (const key of ["appStatus", "recentActivity", "infrastructure", "apiOverview"]) await card(key).waitFor()
          await card("appStatus").getByText("104", { exact: true }).waitFor()
          await card("apiOverview").getByText("/fixture-failure", { exact: true }).waitFor()
          if (admin) await until(async () => (await card("apiOverview").locator("path.recharts-sector").count()) > 0)
          else await until(async () => (await card("apiOverview").locator("canvas").count()) >= 2)
          assert.equal(await main.getByText(t("businessData"), { exact: true }).count(), 0)
          assert.equal(state.calls.filter((call) => call.kind === "business").length, 1)
          assert.deepEqual(state.calls.find((call) => call.kind === "operations-overview").params, [["range", "7d"]])
          for (const kind of ["distribution", "top", "trend"])
            assert(
              state.calls.some(
                (call) => call.kind === kind && call.params.some(([key, value]) => key === "range" && value === "24h"),
              ),
            )
          await settleSourceCharts()
          await shot("six-modules-zh-light")
          checkpoint(
            "six authorized modules, ordered composition, business merged into health, seven-day overview/system/zero metrics and 24h API requests",
          )
          const recent = card("recentActivity")
          await recent.getByText(title("migration-task-0"), { exact: true }).waitFor()
          assert.equal(await recent.getByText(title("migration-task-5"), { exact: true }).count(), 0)
          await recent.getByRole("button", { name: t("viewAllActivities"), exact: true }).click()
          await dialog("allActivities").getByText(title("migration-task-19"), { exact: true }).click()
          await dialog("activityDetails").getByText("task.succeeded", { exact: true }).waitFor()
          await dialog("activityDetails").getByText("Migration Operator", { exact: true }).waitFor()
          await dialog("activityDetails")
            .getByText(t("activity.taskFailedDescription", { error: "Migration detail" }), { exact: true })
            .waitFor()
          await shot("activity-detail")
          await close("activityDetails")
          await close("allActivities")
          const beforeCategory = state.calls.filter((call) => call.kind === "activities").length
          await recent.getByRole("button", { name: t("activityCategory.user"), exact: true }).click()
          await until(() => state.calls.filter((call) => call.kind === "activities").length > beforeCategory)
          const categoryCall = state.calls.filter((call) => call.kind === "activities").at(-1)
          if (admin) {
            assert(categoryCall.params.some(([key, value]) => key === "categories" && value === "user"))
            await recent.getByText(title("filtered-user"), { exact: true }).waitFor()
            assert.equal(await recent.getByText(title("migration-task-0"), { exact: true }).count(), 0)
          } else {
            assert(
              categoryCall.params.some(([key, value]) => key === "categories[0]" && value === "user"),
              "source indexed category baseline",
            )
            await recent.getByText(title("migration-task-0"), { exact: true }).waitFor()
          }
          await recent.getByRole("button", { name: t("activityCategory.all"), exact: true }).click()
          await recent.getByText(title("migration-task-0"), { exact: true }).waitFor()
          await emit("dashboard:activity.created", activity("live-task"))
          await recent.getByText(title("live-task"), { exact: true }).waitFor()
          await emit("dashboard:activity.created", activity("live-task"))
          assert.equal(await recent.getByText(title("live-task"), { exact: true }).count(), 1)
          checkpoint(
            "five visible activities, all twenty drawer, full independent detail, category contract/source baseline, and deduplicated live activity",
          )
          const infra = card("infrastructure")
          const selectInstance = async (value) => {
            if (admin) {
              await infra.getByRole("combobox", { name: t("instance"), exact: true }).click()
              await page.getByRole("option", { name: value, exact: true }).click()
            } else {
              await infra.locator(".n-select").click()
              await page.locator(".n-base-select-option:visible").getByText(value, { exact: true }).click()
            }
          }
          await selectInstance("node-b")
          await infra.getByText("CPU", { exact: true }).locator("..").getByText("90%", { exact: true }).waitFor()
          await emit("dashboard:resources", resource("node-a", 70, 10, 100))
          await selectInstance(t("allInstances", { n: 2 }))
          await infra.getByText("CPU", { exact: true }).locator("..").getByText("80%", { exact: true }).waitFor()
          await infra.getByText("82.7%", { exact: true }).waitFor()
          await infra.getByText("PostgreSQL", { exact: true }).waitFor()
          await infra.getByText("3ms", { exact: true }).waitFor()
          await emit("dashboard:api_stats", { topFailures: [failure("/stream-failure")] })
          await card("apiOverview").getByText("/stream-failure", { exact: true }).waitFor()
          await emit("dashboard:api_stats", { topFailures: [] })
          if (admin)
            await until(
              async () => (await card("apiOverview").getByText("/stream-failure", { exact: true }).count()) === 0,
            )
          else await card("apiOverview").getByText("/stream-failure", { exact: true }).waitFor()
          await shot("resources-api-live")
          checkpoint(
            "instance selection and weighted summary, live hostname replacement, service latency/network and API top failures including empty-event baseline",
          )
          state.failed.add("operations-overview")
          await go()
          await card("operationsOverview")
            .getByRole("button", { name: admin ? "重试" : t("retry"), exact: true })
            .waitFor()
          await card("appStatus").getByText("104", { exact: true }).waitFor()
          const beforeRetry = state.calls.filter((call) => call.kind === "operations-overview").length
          state.failed.delete("operations-overview")
          await card("operationsOverview")
            .getByRole("button", { name: admin ? "重试" : t("retry"), exact: true })
            .click()
          await card("operationsOverview").getByText("95.00%", { exact: true }).waitFor()
          assert.equal(state.calls.filter((call) => call.kind === "operations-overview").length, beforeRetry + 1)
          let release
          state.gates.set(
            "operations-overview",
            new Promise((resolve) => {
              release = resolve
            }),
          )
          await go()
          try {
            if (admin) await card("operationsOverview").getByRole("status").waitFor()
            else await card("operationsOverview").locator(".n-spin").waitFor()
            await shot("overview-loading")
          } finally {
            release()
            state.gates.delete("operations-overview")
          }
          await card("operationsOverview").getByText("95.00%", { exact: true }).waitFor()
          for (const kind of ["activities", "distribution", "top", "trend", "resources"]) state.empty.add(kind)
          await go()
          await card("operationsOverview").getByText("95.00%", { exact: true }).waitFor()
          await card("recentActivity")
            .getByText(admin ? t("noData") : t("noActivity"), { exact: true })
            .waitFor()
          await until(
            async () => (await card("apiOverview").getByText(t("noData"), { exact: true }).count()) === (admin ? 3 : 1),
          )
          await shot("empty-modules")
          state.empty.clear()
          for (const granted of ["dashboard.business", "dashboard.application-health"]) {
            state.allowed = [granted]
            const start = state.calls.length
            await go()
            await card(granted === "dashboard.business" ? "businessData" : "appStatus").waitFor()
            await until(() =>
              state.calls
                .slice(start)
                .some((call) => call.kind === (granted === "dashboard.business" ? "business" : "health")),
            )
            assert(
              state.calls
                .slice(start)
                .every((call) =>
                  ["capabilities", granted === "dashboard.business" ? "business" : "health"].includes(call.kind),
                ),
            )
          }
          state.allowed = [...capabilities]
          await go()
          await card("operationsOverview").getByText("95.00%", { exact: true }).waitFor()
          checkpoint(
            "independent failed/loading/empty states, local retry preserving other modules, and business-only/health-only capability request gating",
          )
        } else {
          await main.getByText("Migration Admin 0", { exact: true }).waitFor()
          assert.equal(await main.getByText("Migration Admin 3", { exact: true }).count(), 0)
          await main.getByRole("button", { name: t("permission.viewAll", { count: 4 }), exact: true }).click()
          await main.getByText("Migration Admin 3", { exact: true }).waitFor()
          await main
            .getByRole("button", { name: t("permission.copyEmailFor", { name: "Migration Admin 3" }), exact: true })
            .click()
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "migration-admin-3@example.test")
          await main.getByRole("button", { name: t("permission.collapse"), exact: true }).click()
          assert.equal(await main.getByText("Migration Admin 3", { exact: true }).count(), 0)
          checkpoint(
            "restricted home permission steps, minimum administrator contacts, first three/expand/collapse and actual named-email clipboard copy",
          )
          state.empty.add("admin-contacts")
          await go()
          await main.getByText(t("permission.contactsUnavailable"), { exact: true }).waitFor()
          state.empty.clear()
          state.failed.add("admin-contacts")
          await go()
          if (admin) await main.getByRole("alert").waitFor()
          else await main.getByText(t("permission.contactsUnavailable"), { exact: true }).waitFor()
          state.failed.clear()
          await go()
          await main.getByText("Migration Admin 0", { exact: true }).waitFor()
          assert(state.calls.every((call) => ["capabilities", "admin-contacts"].includes(call.kind)))
          assert.equal(sockets.length, 0)
          await shot("restricted-contacts")
          checkpoint(
            "contact empty/error recovery with no metric requests or administrator namespace for the ordinary account",
          )
        }
        if (admin && account === "admin") {
          for (const trigger of ["paused category", "manual retry"]) {
            if (trigger === "manual retry") state.failed.add("activities")
            await go()
            await card("operationsOverview").getByText("95.00%", { exact: true }).waitFor()
            const recent = card("recentActivity")
            if (trigger === "manual retry") {
              await recent.getByRole("button", { name: "重试", exact: true }).waitFor()
              state.failed.delete("activities")
            } else await recent.getByText(title("migration-task-0"), { exact: true }).waitFor()
            await card("apiOverview").getByText("/fixture-failure", { exact: true }).waitFor()
            let releaseCapabilities
            state.allowed = []
            state.gates.set(
              "capabilities",
              new Promise((resolve) => {
                releaseCapabilities = resolve
              }),
            )
            const start = state.calls.length
            if (trigger === "paused category") {
              await page.evaluate(() => window.dispatchEvent(new Event("offline")))
              await recent.getByRole("button", { name: t("activityCategory.user"), exact: true }).click()
              await recent.getByRole("status").waitFor()
              assert.equal(state.calls.length, start, "offline category must pause without HTTP")
            }
            await page.evaluate(() => {
              window.dispatchEvent(new Event("online"))
              window.dispatchEvent(new Event("focus"))
            })
            try {
              await until(() => state.calls.slice(start).some((call) => call.kind === "capabilities"))
              if (trigger === "manual retry") await recent.getByRole("button", { name: "重试", exact: true }).click()
              await page.evaluate(async () => {
                await new Promise(requestAnimationFrame)
                await new Promise(requestAnimationFrame)
              })
              assert.equal(state.calls.slice(start).filter((call) => call.kind === "capabilities").length, 1)
              assert(
                state.calls.slice(start).every((call) => call.kind === "capabilities"),
                `${trigger}: no module HTTP before fresh capabilities`,
              )
            } finally {
              releaseCapabilities()
              state.gates.delete("capabilities")
            }
            await main.getByText("Migration Admin 0", { exact: true }).waitFor()
            assert(state.calls.slice(start).every((call) => ["capabilities", "admin-contacts"].includes(call.kind)))
            state.allowed = [...capabilities]
            await page.evaluate(() => window.dispatchEvent(new Event("focus")))
            await card("operationsOverview").getByText("95.00%", { exact: true }).waitFor()
          }
          for (const [status, label] of [
            ["delayed", "同步延迟"],
            ["failed", "同步失败"],
            ["unavailable", "同步不可用"],
            ["healthy", "同步正常"],
          ]) {
            state.syncStatus = status
            await go()
            await card("operationsOverview").getByText(label, { exact: true }).waitFor()
          }
          checkpoint(
            "online/focus recovery coalesces; paused category and explicit retry wait for fresh capabilities before revoked module reads; sync states remain distinct",
          )
        }
        if (admin && account === "admin") {
          await go()
          const recent = card("recentActivity"),
            infra = card("infrastructure"),
            api = card("apiOverview")
          await recent.getByText(title("migration-task-0"), { exact: true }).waitFor()
          await api.getByText("/fixture-failure", { exact: true }).waitFor()
          const refresh = main.getByRole("button", { name: "刷新", exact: true })
          await until(() => refresh.isEnabled())
          const originalInstances = state.instances
          state.activityItems = [
            activity("missed-offline"),
            ...Array.from({ length: 19 }, (_, i) => activity(`migration-task-${i}`)),
          ]
          state.instances = [resource("node-a", 20), resource("node-c", 30)]
          let releaseSnapshot
          const snapshot = new Promise((resolve) => {
            releaseSnapshot = resolve
          })
          for (const kind of ["activities", "resources", "top"]) state.gates.set(kind, snapshot)
          const start = state.calls.length
          await refresh.click()
          try {
            await until(() =>
              ["activities", "resources", "top"].every((kind) =>
                state.calls.slice(start).some((call) => call.kind === kind),
              ),
            )
            await emit("dashboard:activity.created", activity("overlap-live-1"))
            await emit("dashboard:activity.created", activity("overlap-live-2"))
            await emit("dashboard:resources", resource("node-a", 99))
            await emit("dashboard:api_stats", { topFailures: [] })
            await recent.getByText(title("overlap-live-2"), { exact: true }).waitFor()
            assert.equal(await recent.getByText(title("missed-offline"), { exact: true }).count(), 0)
          } finally {
            releaseSnapshot()
            for (const kind of ["activities", "resources", "top"]) state.gates.delete(kind)
          }
          await until(() => refresh.isEnabled())
          for (const id of ["overlap-live-2", "overlap-live-1", "missed-offline"])
            await recent.getByText(title(id), { exact: true }).waitFor()
          await infra.getByText("CPU", { exact: true }).locator("..").getByText("64.5%", { exact: true }).waitFor()
          await infra.getByRole("combobox", { name: t("instance"), exact: true }).click()
          await page.getByRole("option", { name: "node-c", exact: true }).waitFor()
          assert.equal(await page.getByRole("option", { name: "node-b", exact: true }).count(), 0)
          await page.keyboard.press("Escape")
          assert.equal(await api.getByText("/fixture-failure", { exact: true }).count(), 0)
          for (const kind of ["activities", "resources", "top"])
            assert.equal(state.calls.slice(start).filter((call) => call.kind === kind).length, 1)
          await shot("live-http-snapshot-merge")
          state.activityItems = null
          state.instances = originalInstances
          checkpoint(
            "complete HTTP snapshot retains missed activities and instance additions/removals while preserving overlapping live updates and empty API top",
          )
        }
        state.failed.add("capabilities")
        await go()
        const retry = main.getByRole("button", { name: admin ? "重试" : t("permission.retry"), exact: true })
        await retry.waitFor()
        state.failed.clear()
        await retry.click()
        await main
          .getByText(account === "admin" ? t("operationsOverview") : "Migration Admin 0", { exact: true })
          .waitFor()
        checkpoint("capability failure is unavailable rather than restricted and supports a real retry")
        if (admin) {
          await page.getByRole("button", { name: "切换语言", exact: true }).click()
          await page.getByRole("menuitemcheckbox", { name: "English", exact: true }).click()
          await page.keyboard.press("Escape")
        } else {
          await page
            .getByRole("button")
            .filter({ has: page.locator("svg.iconify--heroicons") })
            .hover()
          await page.getByText("English", { exact: true }).filter({ visible: true }).click()
        }
        english = true
        await page.setViewportSize({ width: 390, height: 844 })
        await ensureDark()
        await settleSourceCharts()
        await shot("en-dark-390")
        if (admin) assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        if (admin) assert(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        if (account === "admin")
          for (const key of ["operationsOverview", "appStatus", "infrastructure", "apiOverview"]) {
            await card(key).screenshot({
              path: fileURLToPath(new URL(`${target}-${account}-${key}-en-dark-390.png`, shots)),
              animations: "disabled",
            })
          }

        if (account === "admin") {
          if (admin)
            assert(
              await card("recentActivity").getByText(t("activityResult.success"), { exact: true }).first().isVisible(),
              "390px homepage keeps activity results visible",
            )
          await card("recentActivity")
            .getByRole("button", { name: t("viewAllActivities"), exact: true })
            .click()
          if (admin)
            assert(
              await dialog("allActivities").getByText(t("activityResult.success"), { exact: true }).first().isVisible(),
              "390px all-activity drawer keeps results visible",
            )
          await dialog("allActivities").getByText(title("migration-task-19"), { exact: true }).click()
          await dialog("activityDetails").getByText("task.succeeded", { exact: true }).waitFor()
          await shot("activity-detail-en-dark-390")
          if (admin) {
            const box = await dialog("activityDetails").boundingBox()
            assert(box && box.x >= 0 && box.x + box.width <= 391)
            await close("activityDetails")
            await close("allActivities")
            for (const level of ["error", "warning"])
              await emit("dashboard:activity.created", {
                ...activity(`mobile-${level}`),
                level,
                titleKey: "migration.unknown.activity",
                descriptionKey: null,
              })
            for (const level of ["error", "warning"]) {
              await card("recentActivity")
                .getByText(t(`activityResult.${level}`), { exact: true })
                .waitFor()
              assert(
                await card("recentActivity")
                  .getByText(t(`activityResult.${level}`), { exact: true })
                  .isVisible(),
                `390px homepage exposes ${level} even with unknown title`,
              )
            }
            await card("recentActivity")
              .getByRole("button", { name: t("viewAllActivities"), exact: true })
              .click()
            for (const level of ["error", "warning"]) {
              await dialog("allActivities")
                .getByText(t(`activityResult.${level}`), { exact: true })
                .waitFor()
              assert(
                await dialog("allActivities")
                  .getByText(t(`activityResult.${level}`), { exact: true })
                  .isVisible(),
                `390px drawer exposes ${level} even with unknown title`,
              )
            }
            await shot("activity-results-en-dark-390")
            const allBox = await dialog("allActivities").boundingBox()
            assert(allBox && allBox.x >= 0 && allBox.x + allBox.width <= 391)
          }
        }
        checkpoint(
          "English/dark 390px complete home and activity detail or restricted contacts, with visible compact activity results",
        )
        // D28: exact read-only source ECharts failure on the deliberately failed overview; target remains error-free.
        assert.deepEqual(errors, !admin && account === "admin" ? ["Initialize failed: invalid dom."] : [])
        assert.deepEqual(errorStages, !admin && account === "admin" ? [4] : [])
        assert.deepEqual(consoleErrors, [])
        assert.deepEqual(failures, [])
        assert(state.calls.every((call) => call.method === "GET"))
        results.push({
          target,
          account,
          checks,
          errors,
          failures,
          consoleErrors,
          fixtureReads: state.calls.length,
          writes: 0,
        })
      } catch (error) {
        await shot("failure").catch(() => {})
        results.push({ target, account, checks, error: String(error), errors, failures, consoleErrors })
        console.error(target, account, error)
      } finally {
        closing = true
        await context.close()
      }
    }
} finally {
  await browser.close()
}
await writeFile(new URL("home-browser-results.json", report), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
assert(results.every((result) => !result.error))
