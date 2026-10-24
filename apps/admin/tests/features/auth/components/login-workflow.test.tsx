// @vitest-environment jsdom
import "@test/setup/layout"
import { generateKeyPairSync, webcrypto } from "node:crypto"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { Navigate, Route, Routes } from "react-router"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import LoginPage from "@/features/auth/components/login-page"
const base = "http://localhost:16000/api/v1/auth"
const keypair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
})
async function setup(path = "/login") {
  await i18n.changeLanguage("en-US")
  renderAdmin(
    <Routes>
      <Route path="/login/:module?" element={<LoginPage />} />
      <Route path="/" element={<AuthorizedHome />} />
    </Routes>,
    { initialEntries: [path] },
  )
  return userEvent.setup()
}
function AuthorizedHome() {
  const token = useAuthStore((state) => state.token)
  return token ? <p>Authorized home</p> : <Navigate to="/login" replace />
}
test("password login exposes recovery navigation and public theme/language controls", async () => {
  const user = await setup()
  expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Switch language" })).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Forgot password?" }))
  expect(await screen.findByRole("heading", { name: "Forgot your password?" })).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Back to login" }))
  expect(await screen.findByRole("button", { name: "Login" })).toBeInTheDocument()
})
test("an existing login does not redirect away from a single-use account link", async () => {
  useAuthStore.getState().setToken("actor", "actor-refresh")
  let seenToken = ""
  server.use(
    http.get(`${base}/invite/validate`, ({ request }) => {
      seenToken = new URL(request.url).searchParams.get("token") || ""
      return HttpResponse.json({ code: 0, data: { valid: true } })
    }),
  )
  await setup("/login/set-password?token=invite%2Btoken")
  expect(await screen.findByLabelText(/^New password/)).toBeInTheDocument()
  expect(seenToken).toBe("invite+token")
  expect(screen.queryByText("Authorized home")).not.toBeInTheDocument()
})
test("a backend lock preserves credentials, blocks duplicate attempts until its wall-clock deadline, and can be retried", async () => {
  vi.stubGlobal("crypto", webcrypto)
  let calls = 0
  server.use(
    http.get(`${base}/keys/public`, () => HttpResponse.json({ code: 0, data: keypair.publicKey })),
    http.post(`${base}/login`, () => {
      calls++
      return HttpResponse.json({ code: 14010, data: { retryAfterSeconds: 2 }, message: "Locked" })
    }),
  )
  const user = await setup()
  await user.type(screen.getByRole("textbox", { name: "Username" }), "admin")
  await user.type(screen.getByLabelText("Password"), "123456")
  await user.click(screen.getByRole("button", { name: "Login" }))
  expect(await screen.findByRole("status")).toHaveTextContent("Too many login attempts. Try again in 00:02.")
  const button = screen.getByRole("button", { name: "Login" })
  expect(button).toBeDisabled()
  expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("admin")
  expect(screen.getByLabelText("Password")).toHaveValue("123456")
  await user.click(button)
  expect(calls).toBe(1)
  const future = Date.now() + 3000
  vi.spyOn(Date, "now").mockReturnValue(future)
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  await waitFor(() => expect(calls).toBe(2))
})

test.each(["set-password", "reset-password"] as const)(
  "an already signed-in %s success clears the old identity and opens a usable login form",
  async (mode) => {
    vi.stubGlobal("crypto", webcrypto)
    useAuthStore.getState().setToken("actor", "actor-refresh")
    server.use(
      http.get(`${base}/${mode === "set-password" ? "invite" : "password-reset"}/validate`, () =>
        HttpResponse.json({ code: 0, data: { valid: true } }),
      ),
      http.get(`${base}/keys/public`, () => HttpResponse.json({ code: 0, data: keypair.publicKey })),
      http.post(`${base}/${mode === "set-password" ? "invite/set-password" : "password-reset/confirm"}`, () =>
        HttpResponse.json({ code: 0, data: true }),
      ),
    )
    const user = await setup(`/login/${mode}?token=valid-token`)
    await user.type(await screen.findByLabelText(/^New password/), "Valid_123")
    await user.type(screen.getByLabelText(/^Confirm password/), "Valid_123")
    await user.click(
      screen.getByRole("button", { name: mode === "set-password" ? "Activate account" : "Reset password" }),
    )
    expect(await screen.findByRole("textbox", { name: "Username" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Login" })).toBeEnabled()
    expect(useAuthStore.getState().token).toBe("")
    expect(localStorage.getItem("accessToken")).toBeNull()
  },
)

test("a user-info failure after accepted credentials preserves the original login draft for retry", async () => {
  vi.stubGlobal("crypto", webcrypto)
  server.use(
    http.get(`${base}/keys/public`, () => HttpResponse.json({ code: 0, data: keypair.publicKey })),
    http.post(`${base}/login`, () =>
      HttpResponse.json({ code: 0, data: { accessToken: "accepted-access", refreshToken: "accepted-refresh" } }),
    ),
    http.get(`${base}/user/info`, () => HttpResponse.json({ code: 15001, data: null })),
  )
  const user = await setup()
  await user.type(screen.getByRole("textbox", { name: "Username" }), "admin")
  await user.type(screen.getByLabelText("Password"), "123456")
  await user.click(screen.getByRole("button", { name: "Login" }))
  expect(await screen.findByText("Login failed")).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("admin")
  expect(screen.getByLabelText("Password")).toHaveValue("123456")
  expect(useAuthStore.getState().token).toBe("")
})

test("accepted credentials stay staged while user information loads, then publish the complete identity", async () => {
  vi.stubGlobal("crypto", webcrypto)
  let started!: () => void,
    release!: () => void,
    authorization = ""
  const ready = new Promise<void>((r) => {
      started = r
    }),
    gate = new Promise<void>((r) => {
      release = r
    })
  server.use(
    http.get(`${base}/keys/public`, () => HttpResponse.json({ code: 0, data: keypair.publicKey })),
    http.post(`${base}/login`, () =>
      HttpResponse.json({ code: 0, data: { accessToken: "accepted-access", refreshToken: "accepted-refresh" } }),
    ),
    http.get(`${base}/user/info`, async ({ request }) => {
      authorization = request.headers.get("Authorization") || ""
      started()
      await gate
      return HttpResponse.json({
        code: 0,
        data: {
          id: "actor",
          username: "admin",
          name: "Admin",
          email: "admin@example.test",
          isAdmin: true,
          roles: [],
          buttons: [],
          createTime: "",
          updateTime: "",
        },
      })
    }),
  )
  const user = await setup()
  await user.type(screen.getByRole("textbox", { name: "Username" }), "admin")
  await user.type(screen.getByLabelText("Password"), "123456")
  await user.click(screen.getByRole("button", { name: "Login" }))
  await ready
  try {
    expect(authorization).toBe("Bearer accepted-access")
    expect(localStorage.getItem("accessToken")).toBe("accepted-access")
    expect(useAuthStore.getState().token).toBe("")
    expect(screen.getByRole("button", { name: "Logging in..." })).toBeDisabled()
  } finally {
    release()
  }
  expect(await screen.findByText("Authorized home")).toBeInTheDocument()
  expect(useAuthStore.getState().token).toBe("accepted-access")
  expect(useAuthStore.getState().userInfo?.id).toBe("actor")
})

test.each([false, true])(
  "a staged login refresh keeps the form mounted until user info settles (success=%s)",
  async (success) => {
    vi.stubGlobal("crypto", webcrypto)
    let reads = 0,
      authorization = "",
      started!: () => void,
      release!: () => void
    const ready = new Promise<void>((resolve) => {
        started = resolve
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
    server.use(
      http.get(`${base}/keys/public`, () => HttpResponse.json({ code: 0, data: keypair.publicKey })),
      http.post(`${base}/login`, () =>
        HttpResponse.json({ code: 0, data: { accessToken: "staged-access", refreshToken: "staged-refresh" } }),
      ),
      http.post(`${base}/token/refresh`, () =>
        HttpResponse.json({ code: 0, data: { accessToken: "rotated-access", refreshToken: "rotated-refresh" } }),
      ),
      http.get(`${base}/user/info`, async ({ request }) => {
        reads++
        if (reads === 1) return HttpResponse.json({ code: 14002, data: null })
        authorization = request.headers.get("Authorization") || ""
        started()
        await gate
        return HttpResponse.json(
          success
            ? {
                code: 0,
                data: {
                  id: "actor",
                  username: "admin",
                  name: "Admin",
                  email: "admin@example.test",
                  isAdmin: true,
                  roles: [],
                  buttons: [],
                  createTime: "",
                  updateTime: "",
                },
              }
            : { code: 15001, data: null },
        )
      }),
    )
    const user = await setup()
    await user.type(screen.getByRole("textbox", { name: "Username" }), "admin")
    await user.type(screen.getByLabelText("Password"), "123456")
    await user.click(screen.getByRole("button", { name: "Login" }))
    await ready
    try {
      expect(reads).toBe(2)
      expect(authorization).toBe("Bearer rotated-access")
      expect(localStorage.getItem("accessToken")).toBe("rotated-access")
      expect(useAuthStore.getState().token).toBe("")
      expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("admin")
      expect(screen.getByLabelText("Password")).toHaveValue("123456")
      expect(screen.getByRole("button", { name: "Logging in..." })).toBeDisabled()
    } finally {
      release()
    }
    if (success) {
      expect(await screen.findByText("Authorized home")).toBeInTheDocument()
      expect(useAuthStore.getState().token).toBe("rotated-access")
      expect(useAuthStore.getState().userInfo?.id).toBe("actor")
    } else {
      expect(await screen.findByText("Login failed")).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("admin")
      expect(screen.getByLabelText("Password")).toHaveValue("123456")
      expect(useAuthStore.getState().token).toBe("")
    }
  },
)
