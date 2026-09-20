// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { http, HttpResponse, delay } from "msw"
import { server } from "@test/setup/server"
import { useAuthStore } from "@/stores/auth"

const notificationSpies = vi.hoisted(() => ({
  notifyRequestError: vi.fn(),
  notifySessionExpired: vi.fn(),
}))

vi.mock("@/services/request-error-notifier", () => notificationSpies)

import { request } from "@/services/request"

const baseUrl = "http://localhost:16000/api/v1"

beforeEach(() => {
  localStorage.clear()
  notificationSpies.notifyRequestError.mockClear()
  notificationSpies.notifySessionExpired.mockClear()
})

afterEach(() => localStorage.clear())

test("ordinary backend errors are sent to the unified notifier", async () => {
  server.use(
    http.get(`${baseUrl}/business-error`, () =>
      HttpResponse.json({ code: 15001, message: "Invalid input", data: null }),
    ),
  )

  const result = await request({ url: "/business-error" })

  expect(result.error).not.toBeNull()
  expect(notificationSpies.notifyRequestError).toHaveBeenCalledTimes(1)
  expect(notificationSpies.notifySessionExpired).not.toHaveBeenCalled()
})

test("concurrent expired requests share one refresh and retry without error notification", async () => {
  let refreshCount = 0
  server.use(
    http.get(`${baseUrl}/protected`, ({ request: interceptedRequest }) => {
      if (interceptedRequest.headers.get("Authorization") === "Bearer new-access") {
        return HttpResponse.json({ code: 0, message: "OK", data: { value: "allowed" } })
      }
      return HttpResponse.json({ code: 14002, message: "Expired", data: null })
    }),
    http.post(`${baseUrl}/auth/token/refresh`, async () => {
      refreshCount += 1
      await delay(20)
      return HttpResponse.json({
        code: 0,
        message: "OK",
        data: { accessToken: "new-access", refreshToken: "new-refresh" },
      })
    }),
  )
  localStorage.setItem("accessToken", "old-access")
  localStorage.setItem("refreshToken", "old-refresh")

  const [first, second] = await Promise.all([
    request<{ value: string }>({ url: "/protected" }),
    request<{ value: string }>({ url: "/protected" }),
  ])

  expect(first.data).toEqual({ value: "allowed" })
  expect(second.data).toEqual({ value: "allowed" })
  expect(refreshCount).toBe(1)
  expect(notificationSpies.notifyRequestError).not.toHaveBeenCalled()
  expect(notificationSpies.notifySessionExpired).not.toHaveBeenCalled()
})

test("a failed refresh clears auth and reports session expiry only once", async () => {
  const originalClearAuth = useAuthStore.getState().clearAuth
  const clearAuth = vi.fn()
  useAuthStore.setState({ clearAuth })
  server.use(
    http.get(`${baseUrl}/expired`, () => HttpResponse.json({ code: 14002, message: "Expired", data: null })),
    http.post(`${baseUrl}/auth/token/refresh`, () =>
      HttpResponse.json({ code: 14003, message: "Invalid refresh token", data: null }),
    ),
  )
  localStorage.setItem("accessToken", "old-access")
  localStorage.setItem("refreshToken", "old-refresh")

  await request({ url: "/expired" })

  expect(clearAuth).toHaveBeenCalledTimes(1)
  expect(notificationSpies.notifySessionExpired).toHaveBeenCalledTimes(1)
  useAuthStore.setState({ clearAuth: originalClearAuth })
})
