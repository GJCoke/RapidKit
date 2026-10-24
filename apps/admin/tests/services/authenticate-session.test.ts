// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { authenticate } from "@/services/authenticate"
import { fetchUserInfo } from "@/services/api/auth"
import { getAuthSession } from "@/services/auth-session"
import { useAuthStore } from "@/stores/auth"
import { beginImpersonation, getCredentials, readImpersonation } from "@/features/auth/impersonation-storage"

const info = {
  id: "replacement",
  username: "replacement",
  name: "Replacement",
  email: "replacement@example.test",
  createTime: "",
  updateTime: "",
  roles: [],
  buttons: [],
  isAdmin: true,
}
afterEach(() => useAuthStore.getState().clearAuth())

test.each(["login", "impersonation"])(
  "a real late HTTP success cancelled after another %s preserves the replacement credentials and actor backup",
  async (replacement) => {
    let release!: () => void, started!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    server.use(
      http.get("http://localhost:16000/api/v1/auth/user/info", async () => {
        started()
        await gate
        return HttpResponse.json({ code: 0, data: { ...info, id: "old", username: "old" } })
      }),
    )
    useAuthStore.getState().clearAuth()
    const dependencies = {
      getSession: getAuthSession,
      fetchPublicKey: async () => ({ data: "KEY", error: null }),
      encrypt: async () => "ciphertext",
      login: async () => ({ data: { accessToken: "old-access", refreshToken: "old-refresh" }, error: null }),
      setToken: useAuthStore.getState().setToken,
      clearAuth: useAuthStore.getState().clearAuth,
      setUserInfo: useAuthStore.getState().setUserInfo,
      fetchUserInfo,
    }
    const result = authenticate({ username: "old-user", password: "123456" }, dependencies)
    await ready
    useAuthStore.getState().setToken("new-access", "new-refresh")
    useAuthStore.getState().setUserInfo(info)
    if (replacement === "impersonation") {
      beginImpersonation(
        {
          sessionId: "new-subject-session",
          accessToken: "subject-access",
          expiresAt: "2099-01-01T00:00:00Z",
          subject: { id: "subject", name: "Subject", username: "subject" },
        },
        "/manage/user",
      )
      useAuthStore.setState({ token: "subject-access", refreshToken: "" })
    }
    const backup = localStorage.getItem("impersonator")
    const credentials = getCredentials()
    release()
    expect((await result).ok).toBe(false)
    expect(getCredentials()).toEqual(credentials)
    expect(useAuthStore.getState().userInfo).toEqual(info)
    expect(localStorage.getItem("impersonator")).toBe(backup)
    if (replacement === "impersonation") expect(readImpersonation()?.sessionId).toBe("new-subject-session")
  },
)
