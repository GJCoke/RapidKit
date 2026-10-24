// @vitest-environment jsdom
import type { ReactNode } from "react"
import { constants, generateKeyPairSync, privateDecrypt, webcrypto } from "node:crypto"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { z } from "zod"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useAccountToken, useRequestRecovery, useAccountPassword } from "@/services/hooks/use-account"
const base = "http://localhost:16000/api/v1/auth"
function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}
afterEach(() => {
  useAuthStore.getState().clearAuth()
  vi.unstubAllGlobals()
})
test("token validation distinguishes missing, invalid, error/retry and valid tokens without consuming them", async () => {
  const calls: string[] = []
  let failed = true
  server.use(
    http.get(`${base}/invite/validate`, ({ request }) => {
      const token = new URL(request.url).searchParams.get("token") || ""
      calls.push(token)
      return failed
        ? HttpResponse.json({ code: 15001, data: null })
        : HttpResponse.json({ code: 0, data: { valid: token === "valid" } })
    }),
  )
  const hook = renderHook(({ token }) => useAccountToken("set-password", token), {
    initialProps: { token: "" },
    wrapper: wrapper(),
  })
  expect(hook.result.current.data).toBeUndefined()
  expect(calls).toEqual([])
  hook.rerender({ token: "valid" })
  await waitFor(() => expect(hook.result.current.isError).toBe(true))
  failed = false
  await act(() => hook.result.current.refetch())
  await waitFor(() => expect(hook.result.current.data).toBe(true))
  hook.rerender({ token: "invalid" })
  await waitFor(() => expect(hook.result.current.data).toBe(false))
  expect(calls).toEqual(["valid", "valid", "invalid"])
})
test("recovery failures preserve retryability and old pending completion cannot succeed in another identity", async () => {
  const bodies: unknown[] = []
  let release!: () => void, started!: () => void
  const ready = new Promise<void>((r) => {
      started = r
    }),
    gate = new Promise<void>((r) => {
      release = r
    })
  server.use(
    http.post(`${base}/password-reset/request`, async ({ request }) => {
      bodies.push(await request.json())
      if (bodies.length === 1) return HttpResponse.json({ code: 15001, data: null })
      started()
      await gate
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  const hook = renderHook(() => useRequestRecovery(), { wrapper: wrapper() })
  await expect(hook.result.current.mutateAsync({ email: "owner@example.test" })).rejects.toBeDefined()
  const pending = hook.result.current.mutateAsync({ email: "owner@example.test" })
  const rejected = expect(pending).rejects.toMatchObject({ code: "ERR_CANCELED" })
  await ready
  useAuthStore.getState().setToken("replacement", "replacement-refresh")
  release()
  await rejected
  expect(bodies).toEqual([{ email: "owner@example.test" }, { email: "owner@example.test" }])
})

const keypair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})
test.each(["set-password", "reset-password"] as const)(
  "%s sends the selected token and real RSA ciphertext only",
  async (mode) => {
    vi.stubGlobal("crypto", webcrypto)
    let payload: { token: string; newPassword: string } | undefined
    server.use(
      http.get(`${base}/keys/public`, () => HttpResponse.json({ code: 0, data: keypair.publicKey })),
      http.post(
        `${base}/${mode === "set-password" ? "invite/set-password" : "password-reset/confirm"}`,
        async ({ request }) => {
          payload = z
            .object({ token: z.string(), newPassword: z.string() })
            .strict()
            .parse(await request.json())
          return HttpResponse.json({ code: 0, data: true })
        },
      ),
    )
    const hook = renderHook(() => useAccountPassword(mode, "single-use-token"), { wrapper: wrapper() })
    await act(() => hook.result.current.mutateAsync("Valid_123"))
    expect(payload?.token).toBe("single-use-token")
    expect(Object.keys(payload!)).toEqual(["token", "newPassword"])
    expect(
      privateDecrypt(
        { key: keypair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        Buffer.from(payload!.newPassword, "base64"),
      ).toString(),
    ).toBe("Valid_123")
  },
)
test("a replaced identity during public-key preparation cancels password submission", async () => {
  vi.stubGlobal("crypto", webcrypto)
  let release!: () => void,
    started!: () => void,
    writes = 0
  const ready = new Promise<void>((r) => {
      started = r
    }),
    gate = new Promise<void>((r) => {
      release = r
    })
  server.use(
    http.get(`${base}/keys/public`, async () => {
      started()
      await gate
      return HttpResponse.json({ code: 0, data: keypair.publicKey })
    }),
    http.post(`${base}/invite/set-password`, () => {
      writes++
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  const hook = renderHook(() => useAccountPassword("set-password", "old-token"), { wrapper: wrapper() })
  const pending = hook.result.current.mutateAsync("Valid_123")
  const rejected = expect(pending).rejects.toMatchObject({ code: "ERR_CANCELED" })
  await ready
  useAuthStore.getState().setToken("new-identity", "new-identity-refresh")
  release()
  await rejected
  expect(writes).toBe(0)
})
