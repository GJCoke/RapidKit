import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
const output = new URL("../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL(`screenshots/builtin/${process.env.PARITY_RUN || "development"}/`, output)
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true })
const results = []
const embedA = "https://iframe-migration.test/文档?path=%2Fkeep&word=a%20b#section"
const embedB = "https://iframe-migration.test/b?value=%252F"
const pathFor = (url) => `/iframe-page/${encodeURIComponent(url)}`
const until = async (check, message = "builtin condition must settle") => {
  const deadline = Date.now() + 20000
  while (!(await check())) {
    assert(Date.now() < deadline, message)
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}
async function interactiveFrame(page, url) {
  const expected = new URL(url).href
  const current = () => page.frames().find((frame) => frame.url() === expected)
  await until(() => current(), `frame loads ${url}`)
  if (await page.locator("[data-route-transition]").count())
    await page.locator('[data-route-transition="idle"]').waitFor()
  await until(
    () =>
      page.locator("iframe").evaluateAll(
        (frames, expected) =>
          frames.some((node) => {
            if (node.src !== expected) return false
            const bounds = node.getBoundingClientRect()
            if (!bounds.width || !bounds.height || getComputedStyle(node).visibility !== "visible") return false
            for (let parent = node; parent; parent = parent.parentElement) {
              if (
                getComputedStyle(parent).pointerEvents === "none" ||
                parent.getAnimations().some((animation) => animation.playState === "running" || animation.pending)
              )
                return false
            }
            return true
          }),
        expected,
      ),
    "iframe parent transitions and pointer interaction must be ready",
  )
  await current().getByLabel("Iframe draft").waitFor()
  return current()
}
const withoutRole = (routes) =>
  routes
    .filter((route) => route.name !== "manage_role" && route.path !== "/manage/role")
    .map((route) => ({ ...route, ...(route.children ? { children: withoutRole(route.children) } : {}) }))
try {
  if (process.env.PARITY_ACCOUNT !== "anonymous")
    for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"])
      for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
        const admin = target === "admin",
          origin = `http://localhost:${admin ? 3100 : 9527}`
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          timezoneId: "Asia/Shanghai",
        })
        const page = await context.newPage(),
          checks = [],
          errors = [],
          failures = [],
          consoleErrors = [],
          writes = [],
          frameReads = []
        let closing = false,
          routeBody,
          hold = false,
          release,
          failedExist = true,
          sourceDraftAfterClose
        page.setDefaultTimeout(20000)
        page.on("pageerror", (error) => errors.push(error.message))
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text())
        })
        page.on("requestfailed", (request) => {
          if (!closing && request.failure()?.errorText !== "net::ERR_ABORTED")
            failures.push({ url: request.url(), error: request.failure()?.errorText })
        })
        page.on("request", (request) => {
          if (
            /\/(?:api\/v1|proxy-default)\//.test(request.url()) &&
            !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
            !/\/auth\/(?:login|refresh)(?:\?|$)/.test(request.url())
          )
            writes.push({ method: request.method(), url: request.url() })
        })
        page.on("response", async (response) => {
          if (!routeBody && /\/(?:api\/v1|proxy-default)\/route\/user(?:\?|$)/.test(response.url())) {
            try {
              const body = await response.json()
              if (body.code === 0) routeBody = body
            } catch (error) {
              if (!closing) failures.push({ url: response.url(), error: String(error) })
            }
          }
        })
        await page.route("https://iframe-migration.test/**", async (route) => {
          const url = route.request().url()
          frameReads.push(url)
          if (new URL(url).pathname === "/slow" && hold)
            await new Promise((resolve) => {
              release = resolve
            })
          if (closing) return
          const label = new URL(url).pathname.endsWith("/b") ? "B" : new URL(url).pathname === "/slow" ? "Slow" : "A"
          await route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture ${label}</title><style>body{font:16px system-ui;margin:20px;background:#fafafa;color:#222}input{box-sizing:border-box;width:100%;padding:12px}button{margin-top:12px;padding:8px}</style></head><body><h1>Embedded ${label}</h1><label>Iframe draft<input aria-label="Iframe draft"></label><button onclick="this.textContent='Clicked locally'">Local action</button></body></html>`,
          })
        })
        await page.route(/\/(?:api\/v1|proxy-default)\/route\/exist\?/, async (route) => {
          if (new URL(route.request().url()).searchParams.get("routeName") !== "migration_builtin_error")
            return route.continue()
          await route.fulfill({
            json: failedExist
              ? { code: 15001, message: "Migration route fixture failure", data: null }
              : { code: 0, data: false },
          })
        })
        const checkpoint = (value) => {
          checks.push(value)
          console.log(target, account, checks.length, value)
        }
        const shot = async (scene) => {
          await page.locator("#nprogress").waitFor({ state: "hidden" })
          await page.screenshot({
            path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
            fullPage: true,
            animations: "disabled",
          })
        }
        const spa = async (path) => {
          await page.evaluate((path) => {
            history.pushState(history.state, "", path)
            window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }))
          }, path)
          await page.waitForURL((url) => url.pathname === path)
        }
        const home = async () => {
          await spa("/home")
          await page.locator("main").waitFor()
          await until(() =>
            page
              .getByText(admin ? "首页" : "首页", { exact: true })
              .count()
              .then((count) => count > 0),
          )
        }
        const waitFrame = (url) => interactiveFrame(page, url)
        const tabs = () =>
          admin
            ? page.getByTestId("chrome-page-tab").filter({ hasText: "嵌入页面" })
            : page.locator("[data-tab-id]").filter({ hasText: "外链页面" })
        try {
          await page.goto(`${origin}/login`)
          await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(account)
          await page.locator('input[type="password"]').fill(process.env.ADMIN_TEST_PASSWORD || "123456")
          await page.getByRole("button", { name: /^(登录|Login|确认)$/ }).click()
          await page.waitForURL((url) => url.pathname === "/home")
          await until(() => Boolean(routeBody))
          await page.locator("main").waitFor()
          checkpoint("real existing account login and authorized backend routes before any route fixture")
          for (const code of ["403", "404", "500"]) {
            await spa(`/${code}`)
            const back = page.getByRole("button", { name: "返回首页", exact: true })
            await back.waitFor()
            if (admin) {
              await page.getByRole("heading", { name: code, exact: true }).waitFor()
              assert(!(await page.getByRole("button", { name: "重试", exact: true }).count()))
            }
            await shot(`${code}-zh-light`)
            await back.click()
            await page.waitForURL((url) => url.pathname === "/home")
          }
          checkpoint("all three exception pages return to the real home; the source 500 has no retry action")
          const filtered = { ...routeBody, data: { ...routeBody.data, routes: withoutRole(routeBody.data.routes) } }
          const rolePattern = /\/(?:api\/v1|proxy-default)\/route\/user(?:\?|$)/
          await page.route(rolePattern, (route) => route.fulfill({ json: filtered }))
          const exists = page.waitForResponse(
            (response) =>
              /\/route\/exist\?/.test(response.url()) &&
              new URL(response.url()).searchParams.get("routeName") === "manage_role",
          )
          await page.goto(`${origin}/manage/role`)
          assert.equal((await (await exists).json()).data, true)
          await page.waitForURL((url) => url.pathname === "/403")
          await page.getByRole("button", { name: "返回首页", exact: true }).waitFor()
          await page.unroute(rolePattern)
          await page.goto(`${origin}/home`)
          await page.locator("main").waitFor()
          await spa("/migration-builtin-missing")
          if (admin) await page.waitForURL((url) => url.pathname === "/404")
          else {
            await page.getByRole("button", { name: "返回首页", exact: true }).waitFor()
            assert.equal(
              new URL(page.url()).pathname,
              "/migration-builtin-missing",
              "source catchall retains the unknown path",
            )
            assert(
              await page
                .locator("svg use")
                .evaluateAll((nodes) =>
                  nodes.some((node) =>
                    [node.getAttribute("href"), node.getAttribute("xlink:href")].some((value) =>
                      value?.endsWith("not-found"),
                    ),
                  ),
                ),
            )
          }
          if (admin) {
            await spa("/migration/builtin/error")
            await page.getByRole("button", { name: "重试", exact: true }).waitFor()
            failedExist = false
            await page.getByRole("button", { name: "重试", exact: true }).click()
            await page.waitForURL((url) => url.pathname === "/404")
          }
          checkpoint(
            "a real known backend route absent from the menu becomes 403, unknown becomes 404, and target existence failures retry",
          )
          await home()
          await spa(pathFor(embedA))
          let a = await waitFrame(embedA)
          assert.equal(a.url(), new URL(embedA).href)
          await a.getByLabel("Iframe draft").fill("kept-A")
          await a.getByRole("button", { name: "Local action", exact: true }).click()
          await a.getByRole("button", { name: "Clicked locally", exact: true }).waitFor()
          await spa(pathFor(embedB))
          const b = await waitFrame(embedB)
          await b.getByLabel("Iframe draft").fill("kept-B")
          await until(async () => (await tabs().count()) === 2)
          await tabs().nth(0).click()
          await page.waitForURL((url) => url.pathname === pathFor(embedA))
          a = await waitFrame(embedA)
          assert.equal(
            await a.getByLabel("Iframe draft").inputValue(),
            admin ? "kept-A" : "",
            "D30 source reloads; target retains the cached draft",
          )
          assert.equal(
            frameReads.filter((url) => new URL(url).pathname === new URL(embedA).pathname).length,
            admin ? 1 : 2,
          )
          await shot("iframe-cache-two-tabs")
          if (admin) await tabs().nth(0).getByRole("button", { name: "关闭", exact: true }).click()
          else await tabs().nth(0).locator('[class*="svg-close"]').click()
          await page.waitForURL((url) => url.pathname === pathFor(embedB))
          const afterClose = await waitFrame(embedB)
          sourceDraftAfterClose = await afterClose.getByLabel("Iframe draft").inputValue()
          assert.equal(
            sourceDraftAfterClose,
            admin ? "kept-B" : "",
            "D30 source reloads; closing one target instance retains the other draft",
          )
          await spa(pathFor(embedA))
          a = await waitFrame(embedA)
          assert.equal(await a.getByLabel("Iframe draft").inputValue(), "")
          assert.equal(
            frameReads.filter((url) => new URL(url).pathname === new URL(embedA).pathname).length,
            admin ? 2 : 3,
          )
          checkpoint(
            "encoded URLs and local actions; target drafts stay isolated and cached, selective close/reopen releases only that instance, source D30 reload baseline",
          )
          hold = true
          await spa(pathFor("https://iframe-migration.test/slow"))
          await until(() => Boolean(release))
          if (admin) {
            await page.getByText("加载中...", { exact: true }).waitFor()
            await page.getByText("嵌入页面加载失败", { exact: true }).waitFor({ timeout: 20000 })
            await shot("iframe-timeout")
          }
          hold = false
          release()
          if (admin) await page.getByRole("button", { name: "重试", exact: true }).click()
          await waitFrame("https://iframe-migration.test/slow")
          if (admin) {
            await spa(pathFor("javascript:alert(1)"))
            await page.getByText("嵌入页面加载失败", { exact: true }).waitFor()
            assert.equal(await page.locator('iframe[src^="javascript:"]').count(), 0)
            await spa(pathFor(embedB))
            await waitFrame(embedB)
          }
          checkpoint(
            "source plain iframe loads after a delay; target timeout, retry, unsafe URL rejection and recovery are usable",
          )
          await home()
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
            await page
              .getByRole("button")
              .filter({ has: page.locator("svg.iconify--material-symbols") })
              .click()
          }
          await page.locator("html.dark").waitFor()
          await page.setViewportSize({ width: 390, height: 844 })
          for (const code of ["403", "404", "500"]) {
            await spa(`/${code}`)
            const back = page.getByRole("button", { name: admin ? "Back home" : "Back to home", exact: true })
            await back.waitFor()
            assert(await page.locator("html").evaluate((element) => element.classList.contains("dark")))
            await page.locator("#nprogress").waitFor({ state: "hidden" })
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
            if (admin) {
              assert(!(await page.title()).includes("route."))
              await page.getByRole("heading", { name: code, exact: true }).waitFor()
            }
            await shot(`${code}-en-dark-390`)
          }
          await spa(pathFor(embedB))
          await waitFrame(embedB)
          if (admin) await page.getByTitle("Embedded page", { exact: true }).filter({ visible: true }).waitFor()
          await page.locator("#nprogress").waitFor({ state: "hidden" })
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          await shot("iframe-en-dark-390")
          checkpoint(
            "English dark 390px exception actions, iframe content and translated title remain usable without horizontal overflow",
          )
          assert.deepEqual(errors, [])
          assert.deepEqual(consoleErrors, [])
          assert.deepEqual(failures, [])
          assert.deepEqual(writes, [])
          results.push({
            target,
            account,
            checks,
            errors,
            failures,
            consoleErrors,
            writes,
            sourceDraftAfterClose,
            frameReads,
          })
        } catch (error) {
          await shot("failure").catch(() => {})
          results.push({
            target,
            account,
            checks,
            error: String(error),
            errors,
            failures,
            consoleErrors,
            writes,
            frameReads,
          })
          console.error(target, account, error)
        } finally {
          closing = true
          hold = false
          release?.()
          await context.close()
        }
      }
  if (!process.env.PARITY_ACCOUNT || process.env.PARITY_ACCOUNT === "anonymous")
    for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
      const admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
        page = await context.newPage()
      const checks = [],
        errors = [],
        failures = [],
        consoleErrors = [],
        privateReads = [],
        apiErrors = [],
        writes = [],
        frameReads = []
      let closing = false
      page.setDefaultTimeout(20000)
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("requestfailed", (request) => {
        if (!closing && request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push({ url: request.url(), error: request.failure()?.errorText })
      })
      page.on("response", async (response) => {
        if (!/\/(?:api\/v1|proxy-default)\//.test(response.url())) return
        try {
          const body = await response.json()
          if ((typeof body.code === "number" && body.code !== 0) || response.status() >= 400)
            apiErrors.push({
              path: new URL(response.url()).pathname.replace(/^\/(?:api\/v1|proxy-default)/, ""),
              code: body.code ?? null,
              status: response.status(),
            })
        } catch (error) {
          if (!closing) failures.push({ url: response.url(), error: String(error) })
        }
      })
      page.on("request", (request) => {
        if (
          /\/(?:api\/v1|proxy-default)\/(?:auth\/user\/info|route\/user|dashboard\/|notifications\/unread-count)/.test(
            request.url(),
          )
        )
          privateReads.push(new URL(request.url()).pathname.replace(/^\/(?:api\/v1|proxy-default)/, ""))
        if (
          /\/(?:api\/v1|proxy-default)\//.test(request.url()) &&
          !["GET", "HEAD", "OPTIONS"].includes(request.method())
        )
          writes.push({ method: request.method(), url: request.url() })
      })
      await page.route("https://iframe-migration.test/**", (route) => {
        frameReads.push(route.request().url())
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;margin:16px}input{box-sizing:border-box;width:100%;padding:12px}button{margin-top:12px}</style></head><body><h1>Public embedded document</h1><label>Iframe draft<input aria-label="Iframe draft"></label><button onclick="this.textContent=\'Clicked locally\'">Local action</button></body></html>',
        })
      })
      const shot = async (scene) => {
        await page.locator("#nprogress").waitFor({ state: "hidden" })
        await page.screenshot({
          path: fileURLToPath(new URL(`${target}-anonymous-${scene}.png`, shots)),
          fullPage: true,
          animations: "disabled",
        })
      }
      const checkpoint = (value) => {
        checks.push(value)
        console.log(target, "anonymous", checks.length, value)
      }
      try {
        await page.goto(`${origin}${pathFor(embedA)}`)
        let frame = await interactiveFrame(page, embedA)
        assert.equal(new URL(page.url()).pathname, pathFor(embedA))
        await frame.getByLabel("Iframe draft").fill("public-kept")
        await frame.getByRole("button", { name: "Local action", exact: true }).click()
        await frame.getByRole("button", { name: "Clicked locally", exact: true }).waitFor()
        assert.deepEqual(privateReads, admin ? [] : ["/notifications/unread-count"])
        await shot("iframe-zh-light")
        checkpoint(
          "public builtin accepts anonymous URL/local actions; target avoids private reads, source retains only its exact D31 unread-count baseline",
        )
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
          await page
            .getByRole("button")
            .filter({ has: page.locator("svg.iconify--material-symbols") })
            .click()
        }
        await page.locator("html.dark").waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        frame = await interactiveFrame(page, embedA)
        assert.equal(await frame.getByLabel("Iframe draft").inputValue(), "public-kept")
        assert.equal(frameReads.length, 1)
        assert.equal(
          await frame.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches),
          false,
          "an unthemed external document keeps the source's light canvas independently of the app theme",
        )
        const frameImage = await page.locator("iframe").filter({ visible: true }).screenshot({ animations: "disabled" })
        const canvasPixel = await page.evaluate(async (base64) => {
          const image = new Image()
          image.src = `data:image/png;base64,${base64}`
          await image.decode()
          const canvas = document.createElement("canvas")
          canvas.width = image.width
          canvas.height = image.height
          const context = canvas.getContext("2d")
          context.drawImage(image, 0, 0)
          return [...context.getImageData(4, 4, 1, 1).data]
        }, frameImage.toString("base64"))
        assert(
          canvasPixel.slice(0, 3).every((channel) => channel >= 220),
          `unthemed external text needs its light default canvas in a dark app: ${canvasPixel}`,
        )
        await page.evaluate(() => document.fonts.ready)
        const dimensions = await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          header: document.querySelector("header")?.scrollWidth,
          headerWidth: document.querySelector("header")?.getBoundingClientRect().width,
        }))
        if (admin) assert(dimensions.document <= dimensions.viewport + 1)
        else {
          assert.deepEqual(
            dimensions,
            { viewport: 390, document: 419, body: 419, header: 419, headerWidth: 390 },
            "D31 exact read-only source anonymous header overflow baseline",
          )
          const frameBounds = await page.locator("iframe").filter({ visible: true }).boundingBox()
          assert(
            frameBounds && frameBounds.x >= 0 && frameBounds.x + frameBounds.width <= 391,
            "source iframe content stays within viewport despite its known header overflow",
          )
        }
        if (admin) await page.getByTitle("Embedded page", { exact: true }).waitFor()
        await shot("iframe-en-dark-390")
        checkpoint(
          "anonymous locale/theme preserve one iframe draft/request and readable canvas; target 390px layout fits, source D31 header-only overflow is exact",
        )
        if (admin) {
          await page.getByRole("button", { name: "Back home", exact: true }).click()
          await page.waitForURL((url) => url.pathname.startsWith("/login"))
          await page.getByRole("heading", { name: "RapidKit Admin", exact: true }).waitFor()
          checkpoint("public back-home reaches an actionable sign-in page")
        }
        assert.deepEqual(apiErrors, admin ? [] : [{ path: "/notifications/unread-count", code: 14003, status: 200 }])
        assert.deepEqual(errors, [])
        assert.deepEqual(failures, [])
        assert.deepEqual(consoleErrors, [])
        assert.deepEqual(writes, [])
        assert.deepEqual(privateReads, admin ? [] : ["/notifications/unread-count"])
        results.push({
          target,
          account: "anonymous",
          checks,
          errors,
          failures,
          consoleErrors,
          privateReads,
          apiErrors,
          writes,
          frameReads,
        })
      } catch (error) {
        await shot("failure").catch(() => {})
        results.push({
          target,
          account: "anonymous",
          checks,
          error: String(error),
          errors,
          failures,
          consoleErrors,
          privateReads,
          apiErrors,
          writes,
          frameReads,
        })
        console.error(target, "anonymous", error)
      } finally {
        closing = true
        await context.close()
      }
    }
} finally {
  await browser.close()
}
await writeFile(new URL("builtin-browser-results.json", output), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
assert(results.every((result) => !result.error))
