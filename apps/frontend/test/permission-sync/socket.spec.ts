import { afterEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>(), reconnect: vi.fn() }))
vi.mock("@/utils/storage", () => ({ localStg: { get: () => "token" } }))
vi.mock("@/hooks/common/app-socket", () => ({
  openAppSocket: () => ({
    on: (event: string, callback: (...args: unknown[]) => void) => state.handlers.set(event, callback),
    io: { on: state.reconnect, off: vi.fn() },
  }),
  closeAppSocket: () => state.handlers.clear(),
}))
import { connectGlobalSocket, disconnectGlobalSocket, setPermissionSignalHandler } from "@/store/modules/auth/shared"

afterEach(() => {
  disconnectGlobalSocket()
  setPermissionSignalHandler(null)
})

it("catches up permissions after explicit namespace reconnection without a Manager reconnect", () => {
  const trigger = vi.fn()
  setPermissionSignalHandler({ trigger, signal: vi.fn() })
  connectGlobalSocket()
  state.handlers.get("connect")?.()
  expect(trigger).not.toHaveBeenCalled()
  state.handlers.get("connect")?.()
  expect(trigger).toHaveBeenCalledOnce()
})
