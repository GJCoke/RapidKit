// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { useLocaleStore } from "@/stores/locale"
import { useAuthStore } from "@/stores/auth"
import { fetchRefreshToken } from "@/services/api/auth"

const baseUrl = "http://localhost:16000/api/v1"
afterEach(() => localStorage.clear())

test("refresh API sends the backend header with locale through an independent transport", async () => {
  localStorage.setItem("accessToken", "expired-access")
  useLocaleStore.setState({ locale: "en-US" })
  let received: Request | undefined
  server.use(
    http.post(`${baseUrl}/auth/token/refresh`, ({ request }) => {
      received = request
      return HttpResponse.json({ code: 0, data: { accessToken: "new-access", refreshToken: "new-refresh" } })
    }),
  )
  const result = await fetchRefreshToken("old-refresh")
  expect(result.error).toBeNull()
  expect(result.data).toEqual({ accessToken: "new-access", refreshToken: "new-refresh" })
  expect(received?.headers.get("X-Refresh-Token")).toBe("old-refresh")
  expect(received?.headers.get("Accept-Language")).toBe("en-US")
  expect(received?.headers.get("Authorization")).toBeNull()
  expect(await received?.text()).toBe("")
})

test("refresh API returns an expired-token error without recursive refresh or auth cleanup", async () => {
  let calls = 0
  const clearAuth = vi.spyOn(useAuthStore.getState(), "clearAuth")
  server.use(
    http.post(`${baseUrl}/auth/token/refresh`, () => {
      calls++
      return HttpResponse.json({ code: 14002, message: "Expired", data: null })
    }),
  )
  try {
    const result = await fetchRefreshToken("expired-refresh")
    expect(result.error).not.toBeNull()
    expect(result.data).toBeNull()
    expect(calls).toBe(1)
    expect(clearAuth).not.toHaveBeenCalled()
  } finally {
    clearAuth.mockRestore()
  }
})
