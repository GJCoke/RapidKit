import { expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ io: vi.fn() }))
vi.mock("socket.io-client", () => ({ io: mock.io }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/utils/diagnostic-message", () => ({
  diagnosticMessage: (message: string, id: string) => `${message}:${id}`,
}))
import { useSocket } from "@/hooks/common/socket"

it("uses websocket even when caller options request polling", () => {
  const instance = { on: vi.fn(), disconnect: vi.fn() }
  mock.io.mockReturnValue(instance)
  useSocket().connect({ url: "https://app.test", ioOptions: { transports: ["polling"] } })
  expect(mock.io.mock.calls[0][1].transports).toEqual(["websocket"])
})

it("accepts only a safe diagnostic ID without displaying server payloads", () => {
  const handlers = new Map<string, (payload: unknown) => void>()
  mock.io.mockReturnValue({ on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler) })
  const error = vi.fn()
  vi.stubGlobal("window", { $message: { error } })
  useSocket().connect({ url: "https://app.test" })
  handlers.get("diagnostic:error")?.({ requestId: "private-unsafe-value", message: "private-payload" })
  expect(error).not.toHaveBeenCalled()
  handlers.get("diagnostic:error")?.({ requestId: "abcdefghijklmnopqrstu", message: "private-payload" })
  expect(error).toHaveBeenCalledWith("request.serverError:abcdefghijklmnopqrstu")
  vi.unstubAllGlobals()
})
