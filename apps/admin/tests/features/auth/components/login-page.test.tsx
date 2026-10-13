import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enUS from "@/locales/en-US/common.json"
import zhCN from "@/locales/zh-CN/common.json"

import {
  createLoginSchema,
  LoginForm,
  resolveAuthenticatedLoginRedirect,
  resolveLoginSuccessPath,
} from "@/features/auth/components/login-form"

const loginFormSource = await readFile(
  new URL("../../../../src/features/auth/components/login-form.tsx", import.meta.url),
  "utf8",
)
const validationMessages = {
  passwordInvalid: "password invalid",
  passwordRequired: "password required",
  usernameInvalid: "username invalid",
  usernameRequired: "username required",
}

await i18n.use(initReactI18next).init({
  lng: "en-US",
  resources: {
    "en-US": {
      translation: {
        auth: {
          login: "Login",
          loggingIn: "Logging in...",
          loginFailed: "Login failed",
          password: "Password",
          rememberMe: "Remember me",
          username: "Username",
        },
      },
    },
  },
})

function renderLoginForm(isPending = false, isError = false) {
  return renderToStaticMarkup(
    createElement(LoginForm, {
      isPending,
      isError,
      onSubmit: () => undefined,
    }),
  )
}

test("login form exposes a primary submit control", () => {
  const markup = renderLoginForm()

  assert.match(markup, /type="submit"/)
  assert.match(markup, />Login</)
})

test("login form disables repeated submission while pending", () => {
  const markup = renderLoginForm(true)

  assert.match(markup, /disabled=""/)
  assert.match(markup, />Logging in\.\.\.</)
})

test("login form exposes authentication failure accessibly", () => {
  assert.match(renderLoginForm(false, true), /role="alert"/)
})

test("production locales translate the remember-me label", () => {
  assert.equal(enUS.auth.rememberMe, "Remember me")
  assert.equal(zhCN.auth.rememberMe, "记住我")
})

test("login schema follows the frontend username and password rules", () => {
  const schema = createLoginSchema(validationMessages)

  const empty = schema.safeParse({ username: "", password: "", rememberMe: false })
  assert.equal(empty.success, false)
  if (!empty.success) {
    assert.deepEqual(
      empty.error.issues.map((issue) => issue.message),
      ["username required", "password required"],
    )
  }

  assert.equal(schema.safeParse({ username: "abc", password: "123456", rememberMe: false }).success, false)
  assert.equal(schema.safeParse({ username: "admin", password: "12345!", rememberMe: false }).success, false)
  assert.deepEqual(schema.parse({ username: " admin ", password: "123456", rememberMe: true }), {
    username: "admin",
    password: "123456",
    rememberMe: true,
  })
})

test("login form uses schema-driven accessible validation", () => {
  assert.match(loginFormSource, /useForm<LoginFormValues>/)
  assert.match(loginFormSource, /zodResolver\(schema\)/)
  assert.match(loginFormSource, /<Controller/)
  assert.match(loginFormSource, /aria-invalid=/)
  assert.match(loginFormSource, /aria-describedby=/)
  assert.doesNotMatch(loginFormSource, /useState|required\s*\n/)

  assert.equal(enUS.auth.validation.usernameRequired, "Please enter user name")
  assert.equal(zhCN.auth.validation.usernameRequired, "请输入用户名")
})

test("successful login returns to the dynamic authorized-home resolver", () => {
  assert.equal(resolveLoginSuccessPath(), "/")
})

test("an authenticated login route redirects even when its mutation observer was unmounted", () => {
  assert.equal(resolveAuthenticatedLoginRedirect("access-token"), "/")
  assert.equal(resolveAuthenticatedLoginRedirect(""), null)
})
