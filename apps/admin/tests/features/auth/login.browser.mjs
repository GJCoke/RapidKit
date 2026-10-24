import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const report = new URL("../../../../../docs/superpowers/reports/admin-migration/", import.meta.url)
const shots = new URL(`screenshots/login/${process.env.PARITY_RUN || "development"}/`, report)
await mkdir(shots, { recursive: true })
const sourceZh = JSON.parse(
  await readFile(new URL("../../../../frontend/src/locales/langs/zh-CN/page.json", import.meta.url)),
).login
const sourceEn = JSON.parse(
  await readFile(new URL("../../../../frontend/src/locales/langs/en-US/page.json", import.meta.url)),
).login
const targetZh = JSON.parse(await readFile(new URL("../../../src/locales/zh-CN/account.json", import.meta.url))).account
const targetEn = JSON.parse(await readFile(new URL("../../../src/locales/en-US/account.json", import.meta.url))).account
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true })
const results = []
async function until(check) {
  const end = Date.now() + 15000
  while (!(await check())) {
    assert(Date.now() < end, "condition must settle")
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}
try {
  for (const target of process.env.PARITY_TARGET ? [process.env.PARITY_TARGET] : ["frontend", "admin"]) {
    for (const account of process.env.PARITY_ACCOUNT ? [process.env.PARITY_ACCOUNT] : ["admin", "guest"]) {
      const admin = target === "admin",
        origin = `http://localhost:${admin ? 3100 : 9527}`
      const errors = [],
        failures = [],
        consoleErrors = [],
        checks = []
      let context,
        page,
        english = false,
        module = "pwd-login",
        closing = false,
        authenticatedStorage
      const state = {
        lock: false,
        loginCalls: 0,
        validation: "valid",
        validationGate: null,
        keyGate: null,
        keyReads: 0,
        failedRecovery: true,
        failedPassword: false,
        recoveryWrites: [],
        passwordWrites: [],
        validations: [],
      }
      const s = () => (english ? sourceEn : sourceZh)
      const a = () => (english ? targetEn : targetZh)
      const text = (targetKey, sourceGroup, sourceKey) => (admin ? a()[targetKey] : s()[sourceGroup][sourceKey])
      const button = (name) => page.getByRole("button", { name, exact: true })
      const shot = (scene) =>
        page.screenshot({
          path: fileURLToPath(new URL(`${target}-${account}-${scene}.png`, shots)),
          fullPage: true,
          animations: "disabled",
        })
      async function ensureDark() {
        const card = admin ? page.locator(".bg-card").first() : page.locator(".n-card").first()
        const darkCard = () =>
          card.evaluate((element) => {
            const color = getComputedStyle(element).backgroundColor
            const channel = Number(color.match(/[\d.]+/)?.[0])
            return color.startsWith("oklch") ? channel < 0.5 : channel < 128
          })
        if (!(await darkCard())) {
          if (admin) await button("Toggle theme").click()
          else
            await page
              .getByRole("button")
              .filter({ has: page.locator("svg.iconify--material-symbols") })
              .click()
        }
        await page.locator("html.dark").waitFor()
        await until(darkCard)
      }
      const checkpoint = (value) => {
        checks.push(value)
        console.log(target, account, checks.length, value)
      }
      async function fresh(fixtures, storageState) {
        if (context) {
          closing = true
          await context.close()
          closing = false
        }
        context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          colorScheme: "light",
          storageState,
        })
        page = await context.newPage()
        page.setDefaultTimeout(15000)
        page.on("pageerror", (error) => errors.push(error.message))
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text())
        })
        page.on("requestfailed", (request) => {
          if (!closing && request.failure()?.errorText !== "net::ERR_ABORTED")
            failures.push({ url: request.url(), error: request.failure()?.errorText })
        })
        if (!fixtures) return
        await page.route(
          /\/auth\/(login|keys\/public|invite\/[^/?]+|password-reset\/[^/?]+)(?:\?|$)/,
          async (route) => {
            const request = route.request(),
              path = new URL(request.url()).pathname
            const reply = (data, code = 0) =>
              route.fulfill({ json: { code, message: code ? "Migration fixture failure" : "OK", data } })
            if (path.endsWith("/auth/login")) {
              state.loginCalls++
              return reply({ retryAfterSeconds: 2 }, 14010)
            }
            if (path.endsWith("/keys/public")) {
              state.keyReads++
              if (state.keyGate) await state.keyGate
              return route.fallback()
            }
            if (path.endsWith("/validate")) {
              state.validations.push(new URL(request.url()).searchParams.get("token"))
              if (state.validationGate) await state.validationGate
              return state.validation === "failed" ? reply(null, 15001) : reply({ valid: state.validation === "valid" })
            }
            const body = request.postDataJSON()
            if (path.endsWith("/password-reset/request")) {
              state.recoveryWrites.push(body)
              if (state.failedRecovery) {
                state.failedRecovery = false
                return reply(null, 15001)
              }
              return reply(true)
            }
            state.passwordWrites.push({ path, body })
            if (state.failedPassword) {
              state.failedPassword = false
              return reply(null, 15001)
            }
            return reply(true)
          },
        )
      }
      const userInput = () =>
        admin
          ? page.getByRole("textbox", { name: "用户名", exact: true })
          : page.getByPlaceholder(sourceZh.common.userNamePlaceholder, { exact: true })
      const loginPassword = () =>
        admin
          ? page.getByLabel("密码", { exact: true })
          : page.getByPlaceholder(sourceZh.common.passwordPlaceholder, { exact: true })
      const loginButton = () => page.locator("form").getByRole("button", { name: admin ? "登录" : "确认", exact: true })
      const emailInput = () =>
        admin
          ? page.getByRole("textbox", { name: a().email, exact: true })
          : page.getByPlaceholder(s().resetPwd.emailPlaceholder, { exact: true })
      const passwordInput = () =>
        admin
          ? page.locator("#account-password")
          : page.getByPlaceholder(s().common.passwordPlaceholder, { exact: true })
      const confirmInput = () =>
        admin
          ? page.locator("#account-confirm-password")
          : page.getByPlaceholder(s().common.confirmPasswordPlaceholder, { exact: true })
      async function validationCount(count) {
        const locator = !admin
          ? page.locator(".n-form-item-feedback--error")
          : module === "pwd-login"
            ? page.locator('[id$="-error"][role="alert"]')
            : page.locator('[data-slot="field"][data-invalid]')
        await until(async () => (await locator.count()) === count)
      }
      async function go(next, token) {
        module = next
        await page.goto(
          `${origin}/login${next === "pwd-login" ? "" : `/${next}`}${token === undefined ? "" : `?token=${encodeURIComponent(token)}`}`,
        )
      }
      try {
        await fresh(false)
        await go("pwd-login")
        await userInput().fill("")
        await loginPassword().fill("")
        await loginButton().click()
        await validationCount(2)
        await shot("login-required")
        await userInput().fill("abc")
        await loginPassword().fill("short!")
        await loginButton().click()
        await validationCount(2)
        await userInput().fill(account)
        await loginPassword().fill(process.env.ADMIN_TEST_PASSWORD || "123456")
        await page.route(
          /\/auth\/user\/info(?:\?|$)/,
          (route) => route.fulfill({ json: { code: 15001, message: "Migration profile failure", data: null } }),
          { times: 1 },
        )
        const failedProfile = page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/auth/user/info"),
        )
        await loginButton().click()
        assert.equal(String((await (await failedProfile).json()).code), "15001")
        await until(async () => !(await loginButton().isDisabled()))
        assert.equal(new URL(page.url()).pathname, "/login")
        assert.equal(await userInput().inputValue(), account)
        assert.equal(await loginPassword().inputValue(), process.env.ADMIN_TEST_PASSWORD || "123456")
        if (admin) await page.getByText("登录失败", { exact: true }).waitFor()
        else
          await page.getByText("Migration profile failure", { exact: true }).filter({ visible: true }).first().waitFor()
        await shot("profile-failure-preserved-draft")
        checkpoint("real accepted login with isolated user-info failure preserves credentials and permits retry")
        if (admin) {
          let reads = 0,
            releaseInfo,
            retryStarted
          const retryReady = new Promise((resolve) => {
              retryStarted = resolve
            }),
            infoGate = new Promise((resolve) => {
              releaseInfo = resolve
            })
          await page.route(
            /\/auth\/user\/info(?:\?|$)/,
            async (route) => {
              reads++
              if (reads === 1) return route.fulfill({ json: { code: 14002, data: null } })
              retryStarted()
              await infoGate
              return route.fulfill({
                json: { code: 15001, message: "Migration refreshed profile failure", data: null },
              })
            },
            { times: 2 },
          )
          const refreshed = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname.endsWith("/auth/token/refresh") &&
              response.request().method() === "POST",
          )
          await loginButton().click()
          try {
            await retryReady
            assert.equal(String((await (await refreshed).json()).code), "0")
            assert.equal(new URL(page.url()).pathname, "/login")
            assert.equal(await userInput().inputValue(), account)
            assert.equal(await loginPassword().inputValue(), process.env.ADMIN_TEST_PASSWORD || "123456")
            assert(await page.locator("form").getByRole("button", { name: "正在登录...", exact: true }).isDisabled())
            await shot("refreshed-profile-pending-draft")
          } finally {
            releaseInfo()
          }
          await page.getByText("登录失败", { exact: true }).waitFor()
          assert.equal(await userInput().inputValue(), account)
          assert.equal(await loginPassword().inputValue(), process.env.ADMIN_TEST_PASSWORD || "123456")
          assert(await loginButton().isEnabled())
          await shot("refreshed-profile-failed-draft")
          checkpoint(
            "real token refresh during staged login keeps the form mounted and preserves its draft after profile retry failure",
          )
        }
        const loggedIn = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname.endsWith("/auth/login") && response.request().method() === "POST",
        )
        await loginButton().click()
        assert.equal(String((await (await loggedIn).json()).code), "0")
        await page.waitForURL((url) => !url.pathname.startsWith("/login"))
        authenticatedStorage = await context.storageState()
        await shot("real-login-home")
        checkpoint("required/format validation and real RSA/backend login for the existing account")

        await fresh(true)
        await go("pwd-login")
        await page.getByRole("checkbox", { name: "记住我", exact: true }).check()
        assert(await page.getByRole("checkbox", { name: "记住我", exact: true }).isChecked())
        await userInput().fill(account)
        await loginPassword().fill("123456")
        await loginButton().click()
        await until(async () => await loginButton().isDisabled())
        assert.equal(await userInput().inputValue(), account)
        assert.equal(await loginPassword().inputValue(), "123456")
        await shot("login-cooldown")
        if (!admin) {
          const dialog = page.getByRole("dialog")
          await dialog.getByText("Migration fixture failure", { exact: true }).waitFor()
          await shot("login-lock-source-modal")
          await dialog.getByRole("button", { name: "确认", exact: true }).click()
          await dialog.waitFor({ state: "hidden" })
        }
        await until(async () => !(await loginButton().isDisabled()))
        assert.equal(state.loginCalls, 1)
        checkpoint("remember checkbox and isolated backend lock countdown prevent retries while preserving credentials")

        await button(text("forgotPassword", "pwdLogin", "forgetPassword")).click()
        module = "reset-pwd"
        await emailInput().waitFor()
        await button(text("send", "resetPwd", "send")).click()
        await validationCount(1)
        await emailInput().fill("invalid")
        await button(text("send", "resetPwd", "send")).click()
        await validationCount(1)
        await emailInput().fill("owner@example.test")
        await button(text("send", "resetPwd", "send")).click()
        await until(() => state.recoveryWrites.length === 1)
        if (admin) await page.getByText(a().failed, { exact: true }).waitFor()
        else
          await page.getByText("Migration fixture failure", { exact: true }).filter({ visible: true }).first().waitFor()
        assert.equal(await emailInput().inputValue(), "owner@example.test")
        await shot("recovery-failed-draft")
        await button(text("send", "resetPwd", "send")).click()
        await page.getByText(text("sent", "resetPwd", "sent"), { exact: true }).waitFor()
        assert.deepEqual(state.recoveryWrites, [{ email: "owner@example.test" }, { email: "owner@example.test" }])
        assert(await page.getByRole("button", { name: /秒后/ }).isDisabled())
        await shot("recovery-neutral-success")
        await button(text("back", "common", "back")).click()
        await loginButton().waitFor()
        checkpoint(
          "recovery required/format checks, backend failure draft/retry, neutral success and resend cooldown; zero real emails",
        )

        for (const mode of ["set-password", "reset-password"]) {
          const sourceGroup = mode === "set-password" ? "setPassword" : "resetPassword"
          const invalid = () =>
            text(mode === "set-password" ? "invalidInvite" : "invalidReset", sourceGroup, "invalidToken")
          const token = `fixture-${mode}-token`
          const reads = state.validations.length
          await go(mode)
          await page.getByText(invalid(), { exact: true }).waitFor()
          assert.equal(state.validations.length, reads)
          state.validation = "invalid"
          let releaseValidation
          state.validationGate = new Promise((resolve) => {
            releaseValidation = resolve
          })
          await go(mode, token)
          try {
            await page
              .getByText(
                text(mode === "set-password" ? "checkingInvite" : "checkingReset", sourceGroup, "checkingTitle"),
                { exact: true },
              )
              .waitFor()
            await shot(`${mode}-checking`)
          } finally {
            releaseValidation()
            state.validationGate = null
          }
          await page.getByText(invalid(), { exact: true }).waitFor()
          await shot(`${mode}-invalid`)
          state.validation = "failed"
          await go(mode, token)
          if (admin) {
            await page.getByText(a().checkFailed, { exact: true }).waitFor()
            state.validation = "valid"
            await button("重试").click()
          } else {
            await page.getByText(invalid(), { exact: true }).waitFor()
            state.validation = "valid"
            await page.reload()
          }
          await passwordInput().waitFor()
          const saveName = text(
            mode === "set-password" ? "activate" : "reset",
            sourceGroup,
            mode === "set-password" ? "activate" : "confirm",
          )
          await button(saveName).click()
          await validationCount(2)
          await passwordInput().fill("Valid_123")
          await confirmInput().fill("Mismatch_123")
          await button(saveName).click()
          await validationCount(1)
          await confirmInput().fill("Valid_123")
          state.failedPassword = true
          let releaseKey
          state.keyGate = new Promise((resolve) => {
            releaseKey = resolve
          })
          const keyReads = state.keyReads,
            writes = state.passwordWrites.length
          await button(saveName).click()
          try {
            await until(() => state.keyReads > keyReads)
            if (admin) {
              assert(await button(saveName).isDisabled())
              const bounds = await button(saveName).boundingBox()
              assert(bounds)
              await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
              assert.equal(state.keyReads, keyReads + 1)
            }
            await shot(`${mode}-preparing`)
          } finally {
            releaseKey()
            state.keyGate = null
          }
          await until(() => state.passwordWrites.length === writes + 1)
          if (admin) await page.getByText(a().failed, { exact: true }).waitFor()
          else
            await page
              .getByText("Migration fixture failure", { exact: true })
              .filter({ visible: true })
              .first()
              .waitFor()
          assert.equal(await passwordInput().inputValue(), "Valid_123")
          assert.equal(await confirmInput().inputValue(), "Valid_123")
          await shot(`${mode}-failed-draft`)
          await button(saveName).click()
          await page.waitForURL((url) => /\/login(?:\/pwd-login)?$/.test(url.pathname))
          await loginButton().waitFor()
          for (const write of state.passwordWrites.slice(writes)) {
            assert.equal(write.body.token, token)
            assert.deepEqual(Object.keys(write.body).sort(), ["newPassword", "token"])
            assert.notEqual(write.body.newPassword, "Valid_123")
            assert(Buffer.from(write.body.newPassword, "base64").length >= 256)
          }
          assert.equal(state.passwordWrites.length, writes + 2)
          if (admin) assert.equal(new URL(page.url()).searchParams.has("token"), false)
          checkpoint(
            `${mode}: missing/loading/invalid/failed validation, required/mismatch, preparing guard, encrypted failure draft/retry and login return; zero real password writes`,
          )
        }

        if (admin) {
          for (const mode of ["set-password", "reset-password"]) {
            await fresh(true, authenticatedStorage)
            await go(mode, `fixture-authenticated-${mode}`)
            await passwordInput().waitFor()
            assert(await page.evaluate(() => Boolean(localStorage.getItem("accessToken"))))
            await passwordInput().fill("Valid_123")
            await confirmInput().fill("Valid_123")
            const writes = state.passwordWrites.length
            await button(mode === "set-password" ? a().activate : a().reset).click()
            await page.waitForURL((url) => url.pathname === "/login" && !url.search)
            await loginButton().waitFor()
            assert.equal(state.passwordWrites.length, writes + 1)
            assert.equal(await page.evaluate(() => localStorage.getItem("accessToken")), null)
            assert.equal(await page.evaluate(() => localStorage.getItem("refreshToken")), null)
            assert.equal(await userInput().inputValue(), "")
            assert.equal(await loginPassword().inputValue(), "")
            await shot(`${mode}-authenticated-success-login`)
          }
          checkpoint(
            "activation and reset success from an existing real session clear local identity and return a usable login",
          )
        }

        if (admin) {
          await button("切换语言").click()
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
        await shot("login-en-dark-390")
        await go("reset-pwd")
        await button(text("send", "resetPwd", "send")).waitFor()
        await ensureDark()
        await shot("recovery-en-dark-390")
        for (const mode of ["set-password", "reset-password"]) {
          await go(mode, "fixture-narrow-token")
          await passwordInput().waitFor()
          await ensureDark()
          if (mode === "reset-password")
            await page
              .getByText(text("sessionsInvalidated", "resetPassword", "sessionsInvalidated"), { exact: true })
              .waitFor()
          await shot(`${mode}-en-dark-390`)
          if (admin) assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        }
        checkpoint(
          "public language/theme switches, English dark 390px login/recovery/activation/reset and session-reset explanation",
        )
        assert.deepEqual(
          errors,
          admin ? [] : ["Array(2)", "Array(2)", "Array(1)", "Array(1)", "Array(2)", "Array(1)", "Array(2)", "Array(1)"],
        )
        assert.deepEqual(consoleErrors, [])
        assert.deepEqual(failures, [])
        results.push({
          target,
          account,
          checks,
          errors,
          failures,
          consoleErrors,
          fixtureRecoveryWrites: state.recoveryWrites.length,
          fixturePasswordWrites: state.passwordWrites.length,
          realEmails: 0,
          realPasswordWrites: 0,
        })
      } catch (error) {
        await shot("failure").catch(() => {})
        results.push({ target, account, checks, error: String(error), errors, failures, consoleErrors })
        console.error(target, account, error)
      } finally {
        closing = true
        if (context) await context.close()
      }
    }
  }
} finally {
  await browser.close()
}
await writeFile(new URL("login-browser-results.json", report), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
assert(results.every((result) => !result.error))
