// @vitest-environment jsdom
import "@test/setup/layout"
import { generateKeyPairSync, webcrypto } from "node:crypto"
import { act, screen, waitFor } from "@testing-library/react"
import { onlineManager } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import i18n from "@/locales"
import { useAuthStore } from "@/stores/auth"
import { recordTokenRotation } from "@/services/auth-session"
import { RequestRecovery, PasswordSetup } from "@/features/auth/components/account-forms"
const base = "http://localhost:16000/api/v1/auth"
const keypair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})
afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})
async function setup() {
  await i18n.changeLanguage("en-US")
  return userEvent.setup()
}

test("recovery validates email, keeps failed drafts and shows a neutral success with disabled resend cooldown", async () => {
  const user = await setup()
  const bodies: unknown[] = []
  server.use(
    http.post(`${base}/password-reset/request`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(bodies.length === 1 ? { code: 15001, data: null } : { code: 0, data: true })
    }),
  )
  renderAdmin(<RequestRecovery onBack={vi.fn()} />)
  await user.click(screen.getByRole("button", { name: "Send reset link" }))
  expect(await screen.findByText("Please enter your email")).toBeInTheDocument()
  const email = screen.getByRole("textbox", { name: "Email" })
  expect(email).toHaveAttribute("aria-invalid", "true")
  expect(email).toHaveAccessibleDescription("Please enter your email")
  await user.type(email, "invalid")
  await user.click(screen.getByRole("button", { name: "Send reset link" }))
  expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument()
  expect(bodies).toHaveLength(0)
  await user.clear(email)
  await user.type(email, "owner@example.test")
  await user.click(screen.getByRole("button", { name: "Send reset link" }))
  expect(await screen.findByText("Request failed. Your draft is preserved; please retry.")).toBeInTheDocument()
  expect(email).toHaveValue("owner@example.test")
  await user.click(screen.getByRole("button", { name: "Send reset link" }))
  expect(
    await screen.findByText(
      "If the address belongs to an eligible account, a reset link will be sent. Check your inbox.",
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled()
  expect(bodies).toEqual([{ email: "owner@example.test" }, { email: "owner@example.test" }])
})
test("missing/invalid tokens do not expose a password form and a validation failure can be retried", async () => {
  await setup()
  let reads = 0,
    failed = true
  const onBack = vi.fn(),
    onRequestAgain = vi.fn()
  server.use(
    http.get(`${base}/password-reset/validate`, () => {
      reads++
      return HttpResponse.json(failed ? { code: 15001, data: null } : { code: 0, data: { valid: false } })
    }),
  )
  const view = renderAdmin(
    <PasswordSetup
      mode="reset-password"
      token=""
      onSuccess={vi.fn()}
      onBack={onBack}
      onRequestAgain={onRequestAgain}
    />,
  )
  expect(screen.getByRole("alert")).toHaveTextContent("This reset link is invalid or expired.")
  expect(reads).toBe(0)
  view.rerender(
    <PasswordSetup
      mode="reset-password"
      token="bad-token"
      onSuccess={vi.fn()}
      onBack={onBack}
      onRequestAgain={onRequestAgain}
    />,
  )
  expect(await screen.findByText("Unable to check the link. Please retry.")).toBeInTheDocument()
  failed = false
  await userEvent.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("This reset link is invalid or expired.")).toBeInTheDocument()
  expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Request a new link" }))
  expect(onRequestAgain).toHaveBeenCalledOnce()
  expect(reads).toBe(2)
})
test.each(["set-password", "reset-password"] as const)(
  "%s validates confirmation, prevents repeated preparing writes and preserves a backend-failed draft",
  async (mode) => {
    const user = await setup()
    vi.stubGlobal("crypto", webcrypto)
    let writes = 0,
      keys = 0,
      release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    server.use(
      http.get(`${base}/${mode === "set-password" ? "invite" : "password-reset"}/validate`, () =>
        HttpResponse.json({ code: 0, data: { valid: true } }),
      ),
      http.get(`${base}/keys/public`, async () => {
        keys++
        if (keys === 1) await gate
        return HttpResponse.json({ code: 0, data: keypair.publicKey })
      }),
      http.post(`${base}/${mode === "set-password" ? "invite/set-password" : "password-reset/confirm"}`, () => {
        writes++
        return HttpResponse.json(writes === 1 ? { code: 15001, data: null } : { code: 0, data: true })
      }),
    )
    const onSuccess = vi.fn()
    renderAdmin(
      <PasswordSetup mode={mode} token="valid-token" onSuccess={onSuccess} onBack={vi.fn()} onRequestAgain={vi.fn()} />,
    )
    const password = await screen.findByLabelText(/^New password/),
      confirm = screen.getByLabelText(/^Confirm password/)
    const save = screen.getByRole("button", {
      name: mode === "set-password" ? "Activate account" : "Reset password",
    })
    await user.click(save)
    expect(await screen.findByText("Please enter password")).toBeInTheDocument()
    expect(password).toHaveAttribute("aria-invalid", "true")
    expect(password).toHaveAccessibleDescription("Please enter password")
    await user.type(password, "Valid_123")
    await user.type(confirm, "Different_123")
    await user.click(save)
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument()
    await user.clear(confirm)
    await user.type(confirm, "Valid_123")
    await user.click(screen.getByRole("button", { name: "Show password: New password" }))
    expect(password).toHaveAttribute("type", "text")
    await user.click(save)
    try {
      await waitFor(() => expect(keys).toBe(1))
      expect(save).toBeDisabled()
      await user.click(save)
      expect(keys).toBe(1)
    } finally {
      act(() => release())
    }
    expect(await screen.findByText("Request failed. Your draft is preserved; please retry.")).toBeInTheDocument()
    expect(password).toHaveValue("Valid_123")
    expect(confirm).toHaveValue("Valid_123")
    await user.click(save)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(writes).toBe(2)
  },
)

test("accepted credential rotation preserves a password draft while replacement login starts a new form", async () => {
  const user = await setup()
  useAuthStore.getState().setToken("actor", "actor-refresh")
  server.use(http.get(`${base}/invite/validate`, () => HttpResponse.json({ code: 0, data: { valid: true } })))
  renderAdmin(
    <PasswordSetup
      mode="set-password"
      token="valid-token"
      onSuccess={vi.fn()}
      onBack={vi.fn()}
      onRequestAgain={vi.fn()}
    />,
  )
  const password = await screen.findByLabelText(/^New password/)
  await user.type(password, "Draft_123")
  act(() => {
    recordTokenRotation("rotated-refresh")
    useAuthStore.getState().setToken("rotated-access", "rotated-refresh")
  })
  expect(await screen.findByLabelText(/^New password/)).toHaveValue("Draft_123")
  act(() => useAuthStore.getState().setToken("replacement", "replacement-refresh"))
  await waitFor(() => expect(screen.getByLabelText(/^New password/)).toHaveValue(""))
})

test("network reconnection does not revalidate a previously checked link or discard its password draft", async () => {
  const user = await setup()
  let reads = 0
  server.use(
    http.get(`${base}/invite/validate`, () => {
      reads++
      return HttpResponse.json({ code: 0, data: { valid: reads === 1 } })
    }),
  )
  const view = renderAdmin(
    <PasswordSetup
      mode="set-password"
      token="valid-token"
      onSuccess={vi.fn()}
      onBack={vi.fn()}
      onRequestAgain={vi.fn()}
    />,
  )
  await user.type(await screen.findByLabelText(/^New password/), "Draft_123")
  await act(async () => {
    onlineManager.setOnline(false)
    onlineManager.setOnline(true)
    await view.queryClient.resumePausedMutations()
    await Promise.all(
      view.queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.promise),
    )
  })
  expect(reads).toBe(1)
  expect(screen.getByLabelText(/^New password/)).toHaveValue("Draft_123")
})
