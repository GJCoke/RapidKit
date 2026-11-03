// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ io: vi.fn() }))
vi.mock("socket.io-client", () => ({ io: mock.io }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/utils/diagnostic-message", () => ({
  diagnosticMessage: (message: string, id: { request_id: string }) => `${message}:${id.request_id}`,
}))
import { useSocket } from "@/hooks/common/socket"

afterEach(() => vi.restoreAllMocks())

it("uses websocket even when caller options request polling", () => {
  const instance = { on: vi.fn(), io: { on: vi.fn() }, disconnect: vi.fn() }
  mock.io.mockReturnValue(instance)
  useSocket().connect({ url: "https://app.test", ioOptions: { transports: ["polling"] } })
  expect(mock.io.mock.calls[0][1].transports).toEqual(["websocket"])
})

it("accepts only a safe diagnostic ID without displaying server payloads", () => {
  const handlers = new Map<string, (payload: unknown) => void>()
  mock.io.mockReturnValue({
    io: { on: vi.fn() },
    on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
  })
  const error = vi.fn()
  vi.stubGlobal("window", { $message: { error } })
  useSocket().connect({ url: "https://app.test" })
  handlers.get("diagnostic:error")?.({ requestId: "private-unsafe-value", message: "private-payload" })
  expect(error).not.toHaveBeenCalled()
  handlers.get("diagnostic:error")?.({ requestId: "abcdefghijklmnopqrstu", message: "private-payload" })
  expect(error).toHaveBeenCalledWith("request.serverError:abcdefghijklmnopqrstu")
  vi.unstubAllGlobals()
})

it("logs connection, reconnection and failures without handshake or server error payload", () => {
  const handlers = new Map<string, (...args: any[]) => void>()
  const reconnect = new Map<string, (...args: any[]) => void>()
  mock.io.mockReturnValue({
    on: (name: string, handler: (...args: any[]) => void) => handlers.set(name, handler),
    io: { on: (name: string, handler: (...args: any[]) => void) => reconnect.set(name, handler) },
  })
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  useSocket().connect({ url: "https://app.test?token=private-token", auth: { token: "private-token" } })
  handlers.get("connect")?.()
  reconnect.get("reconnect_attempt")?.(2)
  handlers.get("disconnect")?.("transport close")
  handlers.get("connect_error")?.(new Error("private-error"))
  expect(debug.mock.calls).toContainEqual([expect.stringContaining("[socket]"), "Socket reconnecting", { attempt: 2 }])
  expect(error).toHaveBeenCalledWith(expect.stringContaining("[socket]"), "Socket connection failed", {
    reason: "connect_error",
  })
  expect(JSON.stringify([...debug.mock.calls, ...error.mock.calls])).not.toContain("private-")
})

it("stops observing manager reconnects after the socket is disposed", () => {
  const handlers = new Map<string, (attempt: number) => void>()
  mock.io.mockReturnValue({
    on: vi.fn(),
    disconnect: vi.fn(),
    io: {
      on: (event: string, handler: (attempt: number) => void) => handlers.set(event, handler),
      off: (event: string, handler: (attempt: number) => void) => {
        if (handlers.get(event) === handler) handlers.delete(event)
      },
    },
  })
  const output = vi.spyOn(console, "debug").mockImplementation(() => {})
  const socket = useSocket()
  socket.connect({ url: "https://app.test" })
  handlers.get("reconnect_attempt")?.(1)
  expect(output).toHaveBeenCalledOnce()
  socket.disconnect()
  handlers.get("reconnect_attempt")?.(2)
  expect(output).toHaveBeenCalledOnce()
})
