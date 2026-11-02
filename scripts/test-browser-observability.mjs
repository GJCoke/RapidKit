/** Opt-in production builds + real Nginx + Chromium + local SDK ingestion, no remote Sentry. */
import assert from "node:assert/strict"
import { spawn, execFileSync } from "node:child_process"
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises"
import { createWriteStream } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { chromium } from "playwright-core"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const project = `rapidkit-d-browser-${randomUUID().slice(0, 8)}`
const output = join(root, "logs/verification", project)
await mkdir(output, { recursive: true })
const release = `rapidkit@${project}`
const requestId = "abcdefghijklmnopqrstu"
const events = []
const bodies = []
const transportHeaders = []
const ingester = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*")
  response.setHeader("Access-Control-Allow-Headers", "*")
  if (request.method === "OPTIONS") {
    response.writeHead(204)
    response.end()
    return
  }
  let body = ""
  for await (const chunk of request) body += chunk
  bodies.push(body)
  transportHeaders.push(request.headers)
  const lines = body.split("\n")
  for (let index = 1; index + 1 < lines.length; index += 2) {
    try {
      if (["event", "error"].includes(JSON.parse(lines[index]).type)) events.push(JSON.parse(lines[index + 1]))
    } catch {}
  }
  response.setHeader("Content-Type", "application/json")
  response.end("{}")
})
await new Promise((resolve) => ingester.listen(0, "127.0.0.1", resolve))
const ingestionOrigin = `http://127.0.0.1:${ingester.address().port}`
const dsn = ingestionOrigin.replace("http://", "http://public@") + "/1"
const containers = []
let browser
let activePage

function docker(...args) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  })
}
async function command(args, logfile, options = {}) {
  const stream = createWriteStream(join(output, logfile))
  const child = spawn(args[0], args.slice(1), {
    cwd: options.cwd || root,
    env: options.env || process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.pipe(stream, { end: false })
  child.stderr.pipe(stream, { end: false })
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  await new Promise((resolve) => stream.end(resolve))
  assert.equal(code, 0, `${logfile}: command failed with ${code}`)
}
async function wait(check, seconds = 30) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("Browser observation condition timed out")
}
function startNginx(app, origin, sourceApp = app) {
  const name = `${project}-${app}`
  containers.push(name)
  docker(
    "run",
    "-d",
    "--name",
    name,
    "--network",
    project,
    "-p",
    "127.0.0.1::80",
    "-v",
    `${root}/docker/prod/nginx.conf:/etc/nginx/templates/nginx.conf.template:ro`,
    "-v",
    `${root}/docker/prod/security-headers.conf:/etc/nginx/security-headers.conf:ro`,
    "-v",
    `${root}/docker/frontend/15-observability-origin.sh:/docker-entrypoint.d/15-observability-origin.sh:ro`,
    "-v",
    `${output}/${sourceApp}-dist:/usr/share/nginx/html:ro`,
    "-e",
    "MAX_REQUEST_BODY_BYTES=10485760",
    "-e",
    "SECURITY_HSTS_ENABLED=false",
    "-e",
    `SENTRY_CONNECT_SRC=${origin}`,
    "-e",
    "NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx",
    "-e",
    "NGINX_ENVSUBST_FILTER=^(MAX_REQUEST_BODY_BYTES|SECURITY_HSTS_ENABLED|SENTRY_CONNECT_SRC)$",
    "nginx:stable-alpine",
  )
  return { name, url: `http://${docker("port", name, "80/tcp").trim()}` }
}

try {
  const commonEnv = {
    ...process.env,
    VITE_SENTRY_DSN: dsn,
    VITE_SENTRY_RELEASE: release,
    SENTRY_RELEASE: release,
    SENTRY_AUTH_TOKEN: "",
    SENTRY_ORG: "",
    SENTRY_PROJECT: "",
    SENTRY_URL: "",
    REQUIRE_SENTRY_UPLOAD: "false",
  }
  await command(
    ["pnpm", "turbo", "build", "--filter=@rapidkit/frontend^...", "--filter=@rapidkit/admin^..."],
    "packages-build.log",
  )
  await Promise.all(
    ["frontend", "admin"].map((app) =>
      command(
        ["pnpm", "exec", "vite", "build", "--mode", "prod", "--outDir", join(output, `${app}-dist`)],
        `${app}-build.log`,
        { cwd: join(root, "apps", app), env: commonEnv },
      ),
    ),
  )
  const publicKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  }).publicKey
  await writeFile(join(output, "public-key.pem"), publicKey)
  await writeFile(
    join(output, "api.py"),
    `import json,base64,hashlib,time
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
class Handler(BaseHTTPRequestHandler):
 protocol_version="HTTP/1.1"
 def reply(self):
  if self.path.endswith('/auth/keys/public'):
   result={'code':0,'message':'ok','data':Path('/fixture/public-key.pem').read_text()}
  elif self.path.endswith('/route/constant'):
   result={'code':0,'message':'ok','data':[]}
  else:
   result={'code':7001,'message':'private-server-message','data':{'body':'private-response-body'}}
  body=json.dumps(result).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.send_header('X-Request-ID','${requestId}');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  if self.headers.get('Upgrade','').lower()=='websocket':
   accept=base64.b64encode(hashlib.sha1((self.headers['Sec-WebSocket-Key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
   self.send_response(101);self.send_header('Upgrade','websocket');self.send_header('Connection','Upgrade');self.send_header('Sec-WebSocket-Accept',accept);self.end_headers();time.sleep(0.1);self.close_connection=True
  else: self.reply()
 def do_POST(self): self.rfile.read(int(self.headers.get('Content-Length',0)));self.reply()
 def log_message(self,*args): pass
ThreadingHTTPServer(('0.0.0.0',8006),Handler).serve_forever()
`,
  )
  docker("network", "create", project)
  const api = `${project}-api`
  containers.push(api)
  docker(
    "run",
    "-d",
    "--name",
    api,
    "--network",
    project,
    "--network-alias",
    "backend-api",
    "--network-alias",
    "minio",
    "-v",
    `${output}:/fixture:ro`,
    process.env.OBSERVABILITY_BROWSER_TEST_IMAGE || "rapidkit-backend:observability-d",
    "python",
    "/fixture/api.py",
  )
  browser = await chromium.launch({ headless: true })
  const summary = { release, applications: {} }
  for (const app of ["frontend", "admin"]) {
    const { name, url } = startNginx(app, ingestionOrigin)
    await wait(async () => (await fetch(url)).ok)
    const response = await fetch(url)
    assert(response.headers.get("content-security-policy").includes(ingestionOrigin))
    const files = await readdir(join(output, `${app}-dist/assets`))
    assert(!files.some((file) => file.endsWith(".map")))
    assert.equal((await fetch(`${url}/assets/anything.js.map`)).status, 404)
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })
    await context.addCookies([{ name: "diagnostic-test", value: "private-cookie", domain: "127.0.0.1", path: "/" }])
    const page = await context.newPage()
    activePage = page
    const consoleErrors = []
    page.on("pageerror", (error) => consoleErrors.push(error.name))
    await page.addInitScript(() => {
      localStorage.setItem("diagnostic-test", "private-local-storage")
      sessionStorage.setItem("diagnostic-test", "private-session-storage")
    })
    await page.goto(`${url}/login?diagnostic=private-query#private-fragment`)
    await page.locator('input[type="password"]').waitFor()
    assert(
      await page.evaluate(
        (url) =>
          new Promise((resolve, reject) => {
            const socket = new WebSocket(url.replace("http:", "ws:") + "/socket.io/?EIO=4&transport=websocket")
            socket.onopen = () => {
              socket.close()
              resolve(true)
            }
            socket.onerror = () => reject(new Error("same-origin WebSocket blocked"))
          }),
        url,
      ),
    )
    const before = events.length
    const inputs = page.locator("input")
    if (app === "admin") await page.locator("#username").fill("private_login")
    else await inputs.filter({ visible: true }).first().fill("private_login")
    await page.locator('input[type="password"]').fill("PrivatePass123")
    if (app === "admin") await page.locator('button[type="submit"]').click()
    else await page.getByRole("button", { name: /确认|confirm/i }).click()
    await wait(() =>
      events.slice(before).some((event) => event.tags?.category === "request" && event.tags?.request_id === requestId),
    )
    await writeFile(join(output, `${app}-feedback.html`), await page.content())
    await page.screenshot({ path: join(output, `${app}-feedback.png`), fullPage: true })
    const copy = page.getByRole("button", { name: /复制请求编号|copy request id/i }).first()
    await copy.waitFor()
    await copy.click()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), requestId)
    assert(!(await page.locator("body").innerText()).includes("private-server-message"))
    await page.screenshot({ path: join(output, `${app}-request-id.png`), fullPage: true })
    // Real browser global handlers receive a production asset filename, not an eval-only frame.
    const fixtureName = "observability-exercise.js"
    await writeFile(
      join(output, `${app}-dist/assets`, fixtureName),
      `setTimeout(()=>{throw new TypeError('private-runtime-password')},0);setTimeout(()=>Promise.reject(new Error('private-promise-token')),50);`,
    )
    const globalStart = events.length
    await page.addScriptTag({ url: `${url}/assets/${fixtureName}?token=private-asset-query` })
    await wait(() => events.length >= globalStart + 2)
    const observed = events.slice(before)
    for (const event of observed) {
      assert.equal(event.release, release)
      assert.equal(event.environment, "PRODUCTION")
      assert.equal(event.tags.application, app === "admin" ? "react" : "vue")
      assert(!JSON.stringify(event).includes("private-"))
      assert(!JSON.stringify(event).includes("PrivatePass123"))
      assert(!JSON.stringify(event).includes("private_login"))
      assert(!event.request && !event.user && !event.extra && !event.breadcrumbs)
      assert.equal(event.sdk?.settings?.infer_ip, "never")
    }
    const mapped = observed
      .flatMap((event) => event.exception?.values || [])
      .flatMap((value) => value.stacktrace?.frames || [])
      .find((frame) => frame.filename?.includes("/assets/") && !frame.filename.includes(fixtureName) && frame.lineno)
    assert(mapped, "expected a stack frame from the actual production request path")
    const application = app === "admin" ? "react" : "vue"
    const key = createHash("sha256").update(release).digest("hex").slice(0, 16)
    const mapPath = join(
      root,
      "apps",
      app,
      ".sentry-artifacts",
      application,
      key,
      "assets",
      mapped.filename.split("/assets/")[1] + ".map",
    )
    const map = JSON.parse(await readFile(mapPath, "utf8"))
    const original = originalPositionFor(new TraceMap(map), {
      line: mapped.lineno,
      column: Math.max(0, (mapped.colno || 1) - 1),
    })
    assert(original.source && original.line, "private source map must resolve the minified frame")
    summary.applications[app] = {
      real_request_id_copy: true,
      sanitized_sdk_events: observed.length,
      global_error_and_promise: true,
      hidden_source_map_resolves: original.source,
      csp: "explicit origin allowed",
      console_error_types: consoleErrors,
    }
    await context.close()
    if (app === "admin") {
      const recoveryContext = await browser.newContext()
      const recoveryPage = await recoveryContext.newPage()
      activePage = recoveryPage
      let attempts = 0
      await recoveryPage.route("**/assets/login-page-*.js", (route) => {
        attempts += 1
        return attempts === 1 ? route.abort("failed") : route.continue()
      })
      await recoveryPage.goto(`${url}/login`)
      await recoveryPage.locator('input[type="password"]').waitFor()
      assert.equal(attempts, 2)
      summary.react_chunk_reloads_once_and_recovers = true
      await recoveryContext.close()
    }
    const bootstrapContext = await browser.newContext()
    const bootstrapPage = await bootstrapContext.newPage()
    activePage = bootstrapPage
    const bootstrapErrors = []
    bootstrapPage.on("pageerror", (error) => bootstrapErrors.push(error.name))
    await bootstrapPage.route("**/assets/bootstrap-*.js", (route) => route.abort("failed"))
    const bootstrapStart = events.length
    await bootstrapPage.goto(url)
    await wait(() =>
      events.slice(bootstrapStart).some((event) => ["bootstrap", "route"].includes(event.tags?.category)),
    )
    await wait(() => bootstrapErrors.length > 0, 5)
    summary.applications[app].bootstrap_failure_reported_and_propagated = true
    await bootstrapContext.close()
    docker("rm", "-f", name)
  }
  // An unconfigured origin is blocked by the actual production CSP.
  const blocked = startNginx("frontend-blocked", "", "frontend")
  await wait(async () => (await fetch(blocked.url)).ok)
  const blockedContext = await browser.newContext()
  const blockedPage = await blockedContext.newPage()
  activePage = blockedPage
  await blockedPage.addInitScript(() => {
    window.__cspViolations = []
    window.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(event.blockedURI))
  })
  const failures = []
  blockedPage.on("requestfailed", (request) => failures.push(request.url()))
  const blockedStart = events.length
  await blockedPage.goto(`${blocked.url}/login`)
  await blockedPage.locator('input[type="password"]').waitFor()
  await blockedPage.getByRole("button", { name: /确认|confirm/i }).click()
  await blockedPage
    .getByRole("button", { name: /复制请求编号|copy request id/i })
    .first()
    .waitFor()
  await wait(
    async () =>
      failures.some((url) => url.startsWith(ingestionOrigin)) ||
      (await blockedPage.evaluate(
        (origin) => window.__cspViolations.some((url) => url.startsWith(origin)),
        ingestionOrigin,
      )),
  )
  assert.equal(events.length, blockedStart)
  summary.unconfigured_origin_blocked = true
  await blockedContext.close()
  assert.throws(() =>
    execFileSync("sh", [join(root, "docker/frontend/15-observability-origin.sh")], {
      env: { PATH: process.env.PATH, SENTRY_CONNECT_SRC: "https://safe.invalid; script-src *" },
      encoding: "utf8",
      stdio: "pipe",
    }),
  )
  summary.invalid_origin_rejected = true
  assert(transportHeaders.length > 0)
  for (const headers of transportHeaders) {
    assert(!headers.cookie, "diagnostic transport must omit browser cookies")
    assert(!headers.referer, "diagnostic transport must omit page referrer")
  }
  summary.transport_omits_cookies_and_referrer = true
  await browser.close()
  browser = undefined
  await writeFile(join(output, "summary.json"), JSON.stringify(summary, null, 2))
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await writeFile(join(output, "failure.html"), await activePage.content())
    await activePage.screenshot({ path: join(output, "failure.png"), fullPage: true })
  }
  throw error
} finally {
  if (browser) await browser.close()
  await writeFile(join(output, "events.json"), JSON.stringify(events, null, 2))
  await writeFile(join(output, "envelopes.txt"), bodies.join("\n"))
  await writeFile(join(output, "transport-headers.json"), JSON.stringify(transportHeaders, null, 2))
  for (const name of containers.reverse()) {
    try {
      await writeFile(join(output, `${name}.log`), docker("logs", name))
    } catch {}
    try {
      docker("rm", "-f", name)
    } catch {}
  }
  try {
    docker("network", "rm", project)
  } catch {}
  await new Promise((resolve) => ingester.close(resolve))
}
console.log(JSON.stringify({ project, output }))
