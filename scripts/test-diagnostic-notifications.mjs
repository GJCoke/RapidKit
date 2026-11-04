/** Verify the real Vue notification entry points on the local development server. */
import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = join(root, "logs/verification/diagnostic-notification/browser")
await mkdir(output, { recursive: true })
const base = process.env.RAPIDKIT_UI_BASE_URL || "http://localhost:9527"
const requestId = "a".repeat(21),
  edgeId = "b".repeat(32)
const browser = await chromium.launch({ headless: true })
const measurements = []
let sentryRequests = 0
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  })
  await context.addInitScript(() => {
    window.__diagnosticTestImport = (path) =>
      import(
        performance.getEntriesByType("resource").find((entry) => new URL(entry.name).pathname === path)?.name || path
      )
  })
  const page = await context.newPage()
  context.on("request", (r) => {
    if (r.resourceType() !== "script" && /sentry|envelope|ingest/i.test(new URL(r.url()).pathname)) sentryRequests++
  })
  await page.route(/\/__diagnostic_ui__(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        "X-Edge-Request-ID": edgeId,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Request-ID,X-Edge-Request-ID",
      },
      body: JSON.stringify({ code: 7001, message: "private-server-error", data: "private-body" }),
    }),
  )
  await page.goto(base + "/login", { waitUntil: "domcontentloaded" })
  await page.locator('input[type="password"]').waitFor()
  const clear = async () => {
    await page.evaluate(async () => {
      const m = await window.__diagnosticTestImport("/src/utils/diagnostic-message.ts")
      m.clearDiagnosticNotifications()
      window.$message?.destroyAll()
    })
    await page.waitForFunction(() => document.querySelectorAll(".diagnostic-notification").length === 0)
  }
  await clear()
  const fail = () =>
    page.evaluate(async () => {
      const { request } = await window.__diagnosticTestImport("/src/service/request/index.ts")
      await request({
        url: "/__diagnostic_ui__?token=private-query",
        method: "post",
        data: { password: "private-password" },
      })
    })
  await fail()
  const card = page.locator(".n-notification").filter({ has: page.locator(".diagnostic-notification") })
  await card.waitFor()
  assert.equal(await page.locator(".n-message").count(), 0)
  assert.equal(await card.locator("code").count(), 1)
  assert.equal(await card.locator("code").innerText(), requestId)
  await fail()
  await card.getByText("同类错误已发生 2 次", { exact: true }).waitFor()
  await card.getByRole("button", { name: "查看详情", exact: true }).click()
  assert.equal(await card.locator("code").count(), 4)
  await card.getByRole("button", { name: "复制网关编号", exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), edgeId)
  await card.getByText("编号已复制", { exact: true }).waitFor()
  const pending = page.waitForEvent("download")
  await card.getByRole("button", { name: "导出诊断包", exact: true }).click()
  const path = join(output, "diagnostics.json")
  await (await pending).saveAs(path)
  const raw = await readFile(path, "utf8")
  assert(!raw.includes("private-") && Buffer.byteLength(raw) <= 65536)
  assert(JSON.parse(raw).lookup.request_ids.includes(requestId))
  await card.screenshot({ path: join(output, "api-expanded-1440.png") })
  await card.getByRole("button", { name: "收起详情", exact: true }).click()
  await card.screenshot({ path: join(output, "api-collapsed-1440.png") })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await card.getByRole("button", { name: "查看详情", exact: true }).click()
    await card.screenshot({ path: join(output, "api-expanded-" + width + ".png") })
    const bounds = await card.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { viewport: innerWidth, left: r.left, right: r.right, width: r.width, contentWidth: el.scrollWidth }
    })
    assert(bounds.left >= 0 && bounds.right <= width && bounds.contentWidth <= bounds.width + 1)
    measurements.push(bounds)
    await card.getByRole("button", { name: "收起详情", exact: true }).click()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(async () => {
    const { useThemeStore } = await window.__diagnosticTestImport("/src/store/modules/theme/index.ts")
    useThemeStore().setThemeScheme("dark")
  })
  await page.waitForTimeout(250)
  await card.screenshot({ path: join(output, "api-dark-1440.png") })
  await page.evaluate(async () => {
    const { useThemeStore } = await window.__diagnosticTestImport("/src/store/modules/theme/index.ts")
    useThemeStore().setThemeScheme("light")
  })
  await clear()
  await page.evaluate(() =>
    document.getElementById("app").__vue_app__.config.errorHandler(new Error("private-render-error")),
  )
  await card.waitFor()
  assert.equal(await card.locator("code").count(), 1)
  assert((await card.getByLabel("故障编号", { exact: true }).count()) > 0)
  await card.screenshot({ path: join(output, "render.png") })
  await clear()
  await page.evaluate(async () => {
    const { reportSocketDiagnostic } = await window.__diagnosticTestImport("/src/utils/socket-diagnostics.ts")
    const { diagnosticGeneration } = await window.__diagnosticTestImport("/src/utils/diagnostics.ts")
    reportSocketDiagnostic({ requestId: "a".repeat(21), message: "private-socket-body" }, diagnosticGeneration())
  })
  await card.waitFor()
  assert.equal(await card.getByLabel("请求编号", { exact: true }).innerText(), requestId)
  await card.getByRole("button", { name: "查看详情", exact: true }).click()
  assert.equal(await card.locator("code").count(), 2)
  await card.screenshot({ path: join(output, "socket.png") })
  await page.evaluate(async () => {
    const { resetDiagnostics } = await window.__diagnosticTestImport("/src/utils/diagnostics.ts")
    resetDiagnostics()
  })
  await card.waitFor({ state: "hidden" })
  const touch = await browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true })
  await touch.addInitScript(() => {
    window.__diagnosticTestImport = (path) =>
      import(
        performance.getEntriesByType("resource").find((entry) => new URL(entry.name).pathname === path)?.name || path
      )
  })
  touch.on("request", (r) => {
    if (r.resourceType() !== "script" && /sentry|envelope|ingest/i.test(new URL(r.url()).pathname)) sentryRequests++
  })
  const mobile = await touch.newPage()
  await mobile.goto(base + "/login", { waitUntil: "domcontentloaded" })
  await mobile.locator("input[type=password]").waitFor()
  await mobile.evaluate(async () => {
    const m = await window.__diagnosticTestImport("/src/utils/diagnostic-message.ts")
    m.clearDiagnosticNotifications()
    m.showDiagnosticNotification(
      "服务暂时不可用，请稍后重试",
      { edge_request_id: "b".repeat(32), client_request_id: "c".repeat(21), diagnostic_id: "d".repeat(21) },
      { source: "request", group: "touch-test" },
    )
  })
  const mobileCard = mobile.locator(".n-notification").filter({ has: mobile.locator(".diagnostic-notification") })
  await mobileCard.waitFor()
  const touchTarget = await mobileCard.getByRole("button", { name: "复制网关编号", exact: true }).boundingBox()
  assert(touchTarget.width >= 44 && touchTarget.height >= 44)
  const closeTarget = await mobileCard.locator(".n-base-close").boundingBox()
  assert(closeTarget.width >= 44 && closeTarget.height >= 44, "touch close target must be 44px")
  await mobileCard.screenshot({ path: join(output, "touch-320.png") })
  assert.equal(sentryRequests, 0)
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        entries: ["api", "render", "socket"],
        copy: true,
        export: true,
        secret_free: true,
        merge_count: true,
        identity_reset: true,
        touch_target: touchTarget,
        measurements,
        sentry_requests: sentryRequests,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      passed: true,
      entries: 3,
      secret_free: true,
      touch_target_44: true,
      sentry_requests: sentryRequests,
      measurements,
    }),
  )
} finally {
  await browser.close()
}
