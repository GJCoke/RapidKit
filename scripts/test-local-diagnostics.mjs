/** Exercise the built Vue app with synthetic data and no diagnostic receiver. */
import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { dirname, extname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "apps/frontend/dist")
const output = join(root, "logs/verification/local-diagnostics-browser")
await mkdir(output, { recursive: true })
await readFile(join(dist, "index.html"))
const requestId = "abcdefghijklmnopqrstu"
const edgeId = "0123456789abcdef0123456789abcdef"
const { publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})
const apiRequests = []
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost")
    const path = url.pathname
    if (path === "/index.html" && url.searchParams.has("time")) {
      response.setHeader("Content-Type", "text/html")
      response.end('<meta name="buildTime" content="browser-test-new-deployment">')
      return
    }
    if (path.startsWith("/api/v1/")) {
      apiRequests.push({ path, clientId: request.headers["x-request-id"] })
      request.resume()
      response.writeHead(200, {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        "X-Edge-Request-ID": edgeId,
      })
      const data = path.endsWith("/auth/keys/public") ? publicKey : path.endsWith("/route/constant") ? [] : undefined
      response.end(
        JSON.stringify(
          data !== undefined
            ? { code: 0, data, message: "ok" }
            : { code: 7001, data: { body: "private-response" }, message: "private-server-message" },
        ),
      )
      return
    }
    const file = resolve(dist, `.${decodeURIComponent(path)}`)
    if (!file.startsWith(`${dist}${sep}`) && file !== dist) {
      response.writeHead(403).end()
      return
    }
    let content
    let extension = extname(file)
    try {
      content = await readFile(file)
    } catch {
      if (extension) {
        response.writeHead(404).end()
        return
      }
      content = await readFile(join(dist, "index.html"))
      extension = ".html"
    }
    response.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".woff2": "font/woff2",
      }[extension] || "application/octet-stream",
    )
    response.end(content)
  } catch {
    response.writeHead(500).end()
  }
})
await new Promise((done) => server.listen(0, "127.0.0.1", done))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })
  await context.addCookies([{ name: "diagnostic-test", value: "private-cookie", url: origin }])
  const requests = []
  await context.route("**/*", (route) => {
    const url = route.request().url()
    requests.push(url)
    return new URL(url).origin === origin ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem("diagnostic-test", "private-local-storage")
    sessionStorage.setItem("diagnostic-test", "private-session-storage")
  })
  await page.goto(`${origin}/login?diagnostic=private-query#private-fragment`)
  await page.locator('input[type="password"]').waitFor()
  await page.evaluate(() => {
    const error = new TypeError("private-runtime-password")
    error.stack = "TypeError: private-runtime-password\n    at /assets/example.js:2:3"
    window.dispatchEvent(new ErrorEvent("error", { error }))
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        reason: new Error("private-promise-token"),
        promise: Promise.resolve(),
      }),
    )
  })
  await page.locator("input").filter({ visible: true }).first().fill("private_login")
  await page.locator('input[type="password"]').fill("PrivatePass123")
  await page.getByRole("button", { name: /确认|confirm/i }).click()
  const exportButton = page.getByRole("button", { name: /导出诊断包|export diagnostics/i }).first()
  await exportButton.waitFor()
  await page.getByRole("button", { name: /查看详情|show details/i }).click()
  const feedback = await page.locator("body").innerText()
  assert(feedback.includes(requestId) && feedback.includes(edgeId))
  assert(!feedback.includes("private-server-message"))
  const copy = page.getByRole("button", { name: /复制请求编号|copy request id/i }).first()
  await copy.click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), requestId)
  await page.screenshot({ path: join(output, "feedback.png"), fullPage: true })
  const beforeDownload = apiRequests.length
  const pending = page.waitForEvent("download")
  await exportButton.click()
  const download = await pending
  assert.match(download.suggestedFilename(), /^rapidkit-diagnostics-\d+\.json$/)
  const saved = join(output, "diagnostics.json")
  await download.saveAs(saved)
  const raw = await readFile(saved, "utf8")
  const report = JSON.parse(raw)
  assert(Buffer.byteLength(raw) <= 65536)
  assert.equal(report.schema_version, 1)
  assert.equal(report.application, "vue")
  assert(report.lookup.request_ids.includes(requestId))
  assert(report.lookup.edge_request_ids.includes(edgeId))
  const fault = report.incidents.find((incident) => incident.category === "request")
  assert(fault)
  assert.equal(fault.context.request_id, requestId)
  assert.equal(fault.context.edge_request_id, edgeId)
  const loginAttempt = apiRequests.find((request) => request.path.endsWith("/auth/login"))
  assert.match(loginAttempt.clientId, /^[A-Za-z0-9_-]{21}$/)
  assert.equal(fault.context.client_request_id, loginAttempt.clientId)
  assert.notEqual(fault.context.client_request_id, requestId)
  assert(
    report.incidents.some((incident) => incident.category === "runtime" && incident.frames[0]?.file === "example.js"),
  )
  assert(report.incidents.some((incident) => incident.category === "promise"))
  assert(!raw.includes("private-") && !raw.includes("private_login") && !raw.includes("PrivatePass123"))
  await page.waitForTimeout(200)
  assert.equal(apiRequests.length, beforeDownload, "download must not make API requests")
  assert(!requests.some((url) => /sentry|envelope|ingest/i.test(new URL(url).pathname)))
  const versionPage = await context.newPage()
  await versionPage.clock.install()
  await versionPage.setViewportSize({ width: 320, height: 844 })
  await versionPage.goto(origin + "/login", { waitUntil: "domcontentloaded" })
  await versionPage.locator('input[type="password"]').waitFor()
  await versionPage.clock.runFor(1000)
  await versionPage.clock.fastForward(180000)
  const version = versionPage.locator(".n-notification").filter({ hasText: /系统版本更新通知|System update/i })
  await version.waitFor()
  await versionPage.clock.runFor(500)
  await versionPage.clock.resume()
  await versionPage.waitForTimeout(500)
  const layout = await version.evaluate((element) => {
    const card = element.getBoundingClientRect()
    return {
      width: innerWidth,
      left: card.left,
      right: card.right,
      buttons: [...element.querySelectorAll("button")].map((button) => {
        const box = button.getBoundingClientRect()
        return { left: box.left, right: box.right, width: box.width }
      }),
    }
  })
  assert(layout.left >= 0 && layout.right <= layout.width)
  assert(layout.buttons.every((button) => button.left >= layout.left && button.right <= layout.right))
  await version.screenshot({ path: join(output, "version-320.png") })
  await version.getByRole("button", { name: /稍后再说|later/i }).click()
  await versionPage.clock.runFor(500)
  await version.waitFor({ state: "hidden" })
  await writeFile(join(output, "version-layout.json"), JSON.stringify(layout, null, 2))
  assert(!requests.some((url) => /sentry|envelope|ingest/i.test(new URL(url).pathname)))
  const result = {
    passed: true,
    bytes: Buffer.byteLength(raw),
    events: report.events.length,
    incidents: report.incidents.length,
    apiRequests: apiRequests.length,
    sentryRequests: 0,
    versionNotification320: true,
  }
  await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
