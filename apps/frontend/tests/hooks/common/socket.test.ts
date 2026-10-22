import { expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ io: vi.fn() }))
vi.mock("socket.io-client", () => ({ io: mock.io }))
import { useSocket } from "@/hooks/common/socket"

it("uses websocket even when caller options request polling", () => {
  const instance = { on: vi.fn(), disconnect: vi.fn() }
  mock.io.mockReturnValue(instance)
  useSocket().connect({ url: "https://app.test", ioOptions: { transports: ["polling"] } })
  expect(mock.io.mock.calls[0][1].transports).toEqual(["websocket"])
})
