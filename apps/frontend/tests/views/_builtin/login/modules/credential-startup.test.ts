// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { createWebHistory } from "vue-router"

afterEach(() => vi.resetModules())

it("cleans the URL before the router captures its initial location", async () => {
  window.history.replaceState(null, "", "/login/reset-password?token=private")
  const credentials = await import("@/views/_builtin/login/modules/credential-token")
  const history = createWebHistory()
  try {
    expect(history.location).toBe("/login/reset-password")
    expect(credentials.getCredentialToken()).toBe("private")
    expect(window.location.search).toBe("")
  } finally {
    history.destroy()
  }
})
