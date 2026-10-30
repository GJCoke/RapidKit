import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Manager, type Socket } from "socket.io-client"
import { openAppSocket, resetAppSockets } from "@/hooks/common/app-socket"
import { connectGlobalSocket, disconnectGlobalSocket, setPermissionSignalHandler } from "@/store/modules/auth/shared"

const state = vi.hoisted(() => ({ token: "old-token", refresh: vi.fn(), trigger: vi.fn(), signal: vi.fn() }))
vi.mock("@/utils/storage", () => ({ localStg: { get: () => state.token } }))
vi.mock("@/service/request", () => ({ refreshAccessToken: state.refresh }))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => ({ resetStore: vi.fn(), impersonation: null }) }))

let root: Socket
let fire: (event: string, ...args: unknown[]) => void
// Drive the real Socket.IO lifecycle without opening a network connection.
function emit(target: object, event: string, ...args: unknown[]) {
  ;(target as { emitReserved: (event: string, ...args: unknown[]) => void }).emitReserved(event, ...args)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Manager.prototype, "open").mockReturnThis()
  vi.spyOn(Manager.prototype, "_packet").mockImplementation(() => {})
  vi.stubGlobal("window", { location: { origin: "https://rapidkit.test" } })
  state.token = "old-token"
  state.refresh.mockResolvedValue(true)
  setPermissionSignalHandler({ trigger: state.trigger, signal: state.signal })
  connectGlobalSocket()
  root = openAppSocket("/")
  fire = (event, ...args) => emit(root, event, ...args)
  root.connected = true
  fire("connect")
  expect(state.trigger).not.toHaveBeenCalled()
})
afterEach(() => {
  disconnectGlobalSocket()
  resetAppSockets()
  setPermissionSignalHandler(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function revoke() {
  fire("auth:revoked", { code: "token_expired" })
  root.connected = false
  fire("disconnect", "io server disconnect")
}
async function renew() {
  const connect = vi.spyOn(root, "connect")
  revoke()
  await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce())
}

it("does not fetch a permission snapshot after normal access-token renewal", async () => {
  await renew()
  fire("connect")
  expect(state.refresh).toHaveBeenCalledOnce()
  expect(state.trigger).not.toHaveBeenCalled()
})

it("keeps a planned renewal classification when the last namespace forces Manager close", async () => {
  await renew()
  emit(root.io, "close", "forced close")
  fire("connect")
  expect(state.trigger).not.toHaveBeenCalled()
})

it("still catches up once after a real transport reconnect, even after a previous renewal", async () => {
  await renew()
  fire("connect")
  state.trigger.mockClear()
  root.connected = true
  emit(root.io, "close", "transport close")
  emit(root.io, "reconnect", 1)
  fire("connect")
  expect(state.trigger).toHaveBeenCalledOnce()
})

it("catches up if transport fails while token renewal is pending", async () => {
  let finish!: (success: boolean) => void
  state.refresh.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const connect = vi.spyOn(root, "connect")
  revoke()
  emit(root.io, "close", "transport error")
  finish(true)
  await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce())
  fire("connect")
  expect(state.trigger).toHaveBeenCalledOnce()
})

it("catches up after a refused renewal handshake instead of reusing the old classification", async () => {
  await renew()
  fire("connect_error", new Error("forbidden"))
  fire("connect")
  expect(state.trigger).toHaveBeenCalledOnce()
})

it("still forwards explicit permission changes during token renewal", async () => {
  await renew()
  const payload = { scope: "menu", revision: 42 }
  fire("permission:changed", payload)
  expect(state.signal).toHaveBeenCalledWith(payload)
})

it("removes recovery listeners when the final owner releases a socket", () => {
  disconnectGlobalSocket()
  resetAppSockets()
  expect(root.io.listeners("close")).toHaveLength(0)
})

it("does not let a buffered expiry event hide an earlier transport interruption", async () => {
  emit(root.io, "close", "transport close")
  await renew()
  fire("connect")
  expect(state.trigger).toHaveBeenCalledOnce()
})

it("catches up when the global listener attaches to an already-connected shared socket", () => {
  disconnectGlobalSocket()
  connectGlobalSocket()
  emit(root.io, "close", "transport close")
  fire("connect")
  expect(state.trigger).toHaveBeenCalledOnce()
})

it("releases global listeners while keeping another owner connected", () => {
  const before = root.listeners("connect").length
  disconnectGlobalSocket()
  expect(root.connected).toBe(true)
  expect(root.listeners("connect")).toHaveLength(before - 1)
  expect(root.listeners("permission:changed")).toHaveLength(0)
})
