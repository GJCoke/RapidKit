// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchValidateInvite,
  fetchSetPassword,
  fetchRequestPasswordReset,
  fetchValidatePasswordReset,
  fetchConfirmPasswordReset,
} from "@/services/api/account"

test("public account services preserve the generated methods, token query, email and encrypted password bodies", async () => {
  const calls: unknown[] = []
  server.use(
    http.all("http://localhost:16000/api/v1/auth/*", async ({ request }) => {
      const url = new URL(request.url)
      calls.push({
        path: url.pathname,
        method: request.method,
        query: Object.fromEntries(url.searchParams),
        body: request.method === "POST" ? await request.json() : null,
      })
      return HttpResponse.json({ code: 0, data: request.method === "GET" ? { valid: true } : true })
    }),
  )
  expect((await fetchValidateInvite("invite+token")).data).toEqual({ valid: true })
  expect((await fetchSetPassword({ token: "invite+token", newPassword: "rsa-ciphertext" })).data).toBe(true)
  expect((await fetchRequestPasswordReset({ email: "owner@example.test" })).data).toBe(true)
  expect((await fetchValidatePasswordReset("reset+token")).data).toEqual({ valid: true })
  expect((await fetchConfirmPasswordReset({ token: "reset+token", newPassword: "rsa-new-ciphertext" })).data).toBe(true)
  expect(calls).toEqual([
    { path: "/api/v1/auth/invite/validate", method: "GET", query: { token: "invite+token" }, body: null },
    {
      path: "/api/v1/auth/invite/set-password",
      method: "POST",
      query: {},
      body: { token: "invite+token", newPassword: "rsa-ciphertext" },
    },
    { path: "/api/v1/auth/password-reset/request", method: "POST", query: {}, body: { email: "owner@example.test" } },
    { path: "/api/v1/auth/password-reset/validate", method: "GET", query: { token: "reset+token" }, body: null },
    {
      path: "/api/v1/auth/password-reset/confirm",
      method: "POST",
      query: {},
      body: { token: "reset+token", newPassword: "rsa-new-ciphertext" },
    },
  ])
})
