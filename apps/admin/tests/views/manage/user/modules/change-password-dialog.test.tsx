// @vitest-environment jsdom
import * as authApi from "@/services/api/auth"
import * as cryptoUtils from "@rapidkit/utils"
import "@test/setup/layout"
import { constants, generateKeyPairSync, privateDecrypt, webcrypto } from "node:crypto"
import { act, cleanup, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { z } from "zod"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import { ChangePasswordDialog } from "@/views/manage/user/modules/change-password-dialog"
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
const originalSubtle = Object.getOwnPropertyDescriptor(globalThis.crypto, "subtle")
const keypair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})
beforeAll(() => Object.defineProperty(globalThis.crypto, "subtle", { configurable: true, value: webcrypto.subtle }))
afterAll(() => {
  if (originalSubtle) Object.defineProperty(globalThis.crypto, "subtle", originalSubtle)
  else Reflect.deleteProperty(globalThis.crypto, "subtle")
})
const base = "http://localhost:16000/api/v1",
  bodySchema = z.object({ oldPassword: z.string().optional(), newPassword: z.string() }).strict()
function decrypt(value: string) {
  return privateDecrypt(
    { key: keypair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(value, "base64"),
  ).toString("utf8")
}
async function setup(admin = true) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "password-ui-session")
  useAuthStore.setState({
    userInfo: {
      id: "actor",
      username: "actor",
      name: "Actor",
      email: "",
      isAdmin: admin,
      roles: [],
      buttons: ["user:reset-password"],
      createTime: "",
      updateTime: "",
    },
  })
  server.use(http.get(`${base}/auth/keys/public`, () => HttpResponse.json({ code: 0, data: keypair.publicKey })))
  return { user: userEvent.setup(), onOpenChange: vi.fn() }
}
function passwordInput(label: string) {
  const input = screen.getByLabelText(`${label}*`)
  expect(input).toHaveAccessibleName(label)
  return input
}
function confirm() {
  return within(screen.getByRole("dialog")).getByRole("button", { name: /^(Confirm|确认)$/ })
}
async function fillOther(user: ReturnType<typeof userEvent.setup>) {
  const inputs = screen.getByRole("dialog").querySelectorAll<HTMLInputElement>('input[type="password"]')
  expect(inputs).toHaveLength(2)
  await user.type(inputs[0], "New_secret1")
  await user.type(inputs[1], "New_secret1")
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  localStorage.removeItem("impersonation")
  vi.restoreAllMocks()
})
test("self password changes validate required fields and matching confirmation, reveal on demand and send both values through real RSA-OAEP", async () => {
  const context = await setup(false),
    writes: z.infer<typeof bodySchema>[] = []
  server.use(
    http.put(`${base}/users/actor/password`, async ({ request }) => {
      writes.push(bodySchema.parse(await request.json()))
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<ChangePasswordDialog open userId="actor" isSelf onOpenChange={context.onOpenChange} />)
  await context.user.click(screen.getByRole("button", { name: "Confirm" }))
  expect(await screen.findByText("Enter the old password")).toBeInTheDocument()
  await context.user.type(passwordInput("Old password"), "Old_secret1")
  await context.user.type(passwordInput("New password"), "New_secret1")
  await context.user.type(passwordInput("Confirm password"), "Different1")
  await context.user.click(screen.getByRole("button", { name: "Show new password" }))
  expect(passwordInput("New password")).toHaveAttribute("type", "text")
  await context.user.click(screen.getByRole("button", { name: "Hide new password" }))
  await context.user.click(screen.getByRole("button", { name: "Confirm" }))
  expect(await screen.findByText("Passwords do not match")).toBeInTheDocument()
  expect(writes).toEqual([])
  await context.user.clear(passwordInput("Confirm password"))
  await context.user.type(passwordInput("Confirm password"), "New_secret1")
  await context.user.click(screen.getByRole("button", { name: "Confirm" }))
  await waitFor(() => expect(context.onOpenChange).toHaveBeenCalledWith(false))
  expect(writes).toHaveLength(1)
  expect(decrypt(writes[0].newPassword)).toBe("New_secret1")
  if (!writes[0].oldPassword) throw new Error("Self changes require encrypted oldPassword")
  expect(decrypt(writes[0].oldPassword)).toBe("Old_secret1")
})
test("public-key and backend failures preserve the password draft; administrators send only an encrypted new password for another user", async () => {
  const context = await setup(),
    writes: z.infer<typeof bodySchema>[] = []
  let keys = 0
  server.use(
    http.get(`${base}/auth/keys/public`, () => {
      keys++
      return HttpResponse.json(
        keys === 1 ? { code: 40001, message: "key unavailable", data: null } : { code: 0, data: keypair.publicKey },
      )
    }),
    http.put(`${base}/users/other/password`, async ({ request }) => {
      writes.push(bodySchema.parse(await request.json()))
      return HttpResponse.json(
        writes.length === 1 ? { code: 40001, message: "try again", data: null } : { code: 0, data: true },
      )
    }),
  )
  renderAdmin(<ChangePasswordDialog open userId="other" isSelf={false} onOpenChange={context.onOpenChange} />)
  await fillOther(context.user)
  await context.user.click(confirm())
  expect(await screen.findByText("Failed", { exact: true })).toBeInTheDocument()
  expect(writes).toEqual([])
  await context.user.click(confirm())
  await waitFor(() => expect(writes).toHaveLength(1))
  await waitFor(() => expect(confirm()).toBeEnabled())
  expect(context.onOpenChange).not.toHaveBeenCalled()
  expect(passwordInput("New password")).toHaveValue("New_secret1")
  await context.user.click(confirm())
  await waitFor(() => expect(context.onOpenChange).toHaveBeenCalledWith(false))
  expect(writes).toHaveLength(2)
  for (const payload of writes) {
    expect(Object.keys(payload)).toEqual(["newPassword"])
    expect(decrypt(payload.newPassword)).toBe("New_secret1")
  }
})
test("the confirmation is already disabled while obtaining the key so a double click cannot start duplicate password operations", async () => {
  const context = await setup()
  let keys = 0,
    writes = 0,
    release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/auth/keys/public`, async () => {
      keys++
      await pending
      return HttpResponse.json({ code: 0, data: keypair.publicKey })
    }),
    http.put(`${base}/users/other/password`, () => {
      writes++
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<ChangePasswordDialog open userId="other" isSelf={false} onOpenChange={context.onOpenChange} />)
  await fillOther(context.user)
  const button = confirm()
  await context.user.dblClick(button)
  await waitFor(() => expect(keys).toBeGreaterThan(0))
  const disabledWhileFetchingKey = button.matches(":disabled")
  release()
  await waitFor(() => expect(context.onOpenChange).toHaveBeenCalledWith(false))
  expect(disabledWhileFetchingKey).toBe(true)
  expect(keys).toBe(1)
  expect(writes).toBe(1)
})
test("revoking administrator eligibility while the key is pending closes the dialog and prevents the password request", async () => {
  const context = await setup()
  let keys = 0,
    writes = 0,
    release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/auth/keys/public`, async () => {
      keys++
      await pending
      return HttpResponse.json({ code: 0, data: keypair.publicKey })
    }),
    http.put(`${base}/users/other/password`, () => {
      writes++
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<ChangePasswordDialog open userId="other" isSelf={false} onOpenChange={context.onOpenChange} />)
  await fillOther(context.user)
  await context.user.click(confirm())
  await waitFor(() => expect(keys).toBe(1))
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false } }))
  release()
  await waitFor(() => expect(context.onOpenChange).toHaveBeenCalledWith(false))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(writes).toBe(0)
})
test("closing an editor before its key response arrives cannot send its password or disturb a new dialog", async () => {
  const context = await setup()
  const keyRequests = vi.spyOn(authApi, "fetchPublicKey")
  const encryptions = vi.spyOn(cryptoUtils, "rsaEncrypt")
  let keys = 0,
    writes = 0,
    release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/auth/keys/public`, async () => {
      keys++
      await pending
      return HttpResponse.json({ code: 0, data: keypair.publicKey })
    }),
    http.put(`${base}/users/other/password`, () => {
      writes++
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  const view = renderAdmin(
    <ChangePasswordDialog open userId="other" isSelf={false} onOpenChange={context.onOpenChange} />,
  )
  await fillOther(context.user)
  await context.user.click(confirm())
  await waitFor(() => expect(keys).toBe(1))
  view.rerender(<ChangePasswordDialog open={false} userId="other" isSelf={false} onOpenChange={context.onOpenChange} />)
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  view.rerender(<ChangePasswordDialog open userId="next" isSelf={false} onOpenChange={context.onOpenChange} />)
  const fields = screen.getByRole("dialog").querySelectorAll<HTMLInputElement>('input[type="password"]')
  await context.user.type(fields[0], "Next_secret1")
  await act(async () => {
    release()
    await keyRequests.mock.results[0].value
    await Promise.all(
      encryptions.mock.results.filter((result) => result.type === "return").map((result) => result.value),
    )
  })
  await waitFor(() => expect(view.queryClient.isMutating()).toBe(0))
  expect(encryptions).not.toHaveBeenCalled()
  expect(fields[0]).toHaveValue("Next_secret1")
  expect(context.onOpenChange).not.toHaveBeenCalledWith(false)
  expect(writes).toBe(0)
})
