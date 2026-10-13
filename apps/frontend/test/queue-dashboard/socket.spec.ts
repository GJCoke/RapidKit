import { afterEach, describe, expect, it, vi } from "vitest"
import { createSSRApp } from "vue"
import { renderToString } from "vue/server-renderer"
import { Manager, io, type Socket } from "socket.io-client"
import { useWorkerSocket } from "@/hooks/business/worker-socket"

const storage = vi.hoisted(() => ({ token: "current-token" }))
vi.mock("@/store/modules/auth/shared", () => ({ getToken: () => storage.token }))
const cleanup: (() => void)[] = []

async function setup(beforeConnect?: () => void) {
  // Keep Socket.IO's real lifecycle; stub only outgoing network operations.
  vi.spyOn(Manager.prototype, "open").mockReturnThis()
  vi.spyOn(Manager.prototype, "_packet").mockImplementation(() => {})
  vi.stubGlobal("window", { location: { origin: "https://rapidkit.test" } })
  let result!: ReturnType<typeof useWorkerSocket>
  await renderToString(
    createSSRApp({
      setup() {
        beforeConnect?.()
        result = useWorkerSocket()
        result.connect()
        return () => null
      },
    }),
  )
  cleanup.push(result.disconnect)
  return result
}

function readAuth(socket: Socket) {
  let credentials: unknown
  if (typeof socket.auth === "function")
    socket.auth((data) => {
      credentials = data
    })
  else credentials = socket.auth
  return credentials
}

afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  storage.token = "current-token"
})

describe("worker socket", () => {
  it("joins worker directly with the latest token on each authentication attempt", async () => {
    let globalSocket!: Socket
    const result = await setup(() => {
      globalSocket = io(new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin)
      cleanup.push(() => globalSocket.disconnect())
    })
    const socket = result.socket.value!
    expect(socket.io).not.toBe(globalSocket.io)
    expect(socket.active).toBe(true)
    expect(readAuth(socket)).toEqual({ access_token: "current-token" })
    storage.token = "refreshed-token"
    expect(readAuth(socket)).toEqual({ access_token: "refreshed-token" })
  })

  it("isolates page connections so disposing one leaves the other active", async () => {
    const first = await setup()
    const second = await setup()
    const firstSocket = first.socket.value!
    const secondSocket = second.socket.value!
    expect(secondSocket.io).not.toBe(firstSocket.io)
    first.disconnect()
    expect(firstSocket.active).toBe(false)
    expect(secondSocket.active).toBe(true)
    expect(first.socket.value).toBeNull()
  })
})
