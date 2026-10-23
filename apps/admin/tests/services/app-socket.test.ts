// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"

vi.mock("socket.io-client", async () => {
  const { EventEmitter } = await import("node:events")
  class FakeSocket extends EventEmitter {
    connected = false
    active = false
    auth: unknown
    connect() {
      this.connected = true
      this.active = true
      return this
    }
    disconnect() {
      this.connected = false
      this.active = false
      return this
    }
  }
  return {
    Manager: class {
      sockets = new Map<string, FakeSocket>()
      socket(namespace: string, options: { auth: unknown }) {
        let socket = this.sockets.get(namespace)
        if (!socket) {
          socket = new FakeSocket()
          this.sockets.set(namespace, socket)
        }
        socket.auth = options.auth
        return socket
      }
    },
  }
})
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { waitFor } from "@testing-library/react"
import { openAppSocket, closeAppSocket, resetAppSockets } from "@/services/app-socket"
import { useAuthStore } from "@/stores/auth"

afterEach(() => {
  resetAppSockets()
  useAuthStore.getState().clearAuth()
  vi.resetAllMocks()
})

test("namespace owners share one live socket until the last owner releases it", () => {
  const first = openAppSocket("/worker")
  const second = openAppSocket("/worker")
  expect(first).toBe(second)
  closeAppSocket(first)
  expect(second.connected).toBe(true)
  closeAppSocket(second)
  expect(second.connected).toBe(false)
})

test("reset disconnects all owners and removes subscriptions before the next account", () => {
  const old = openAppSocket("/")
  openAppSocket("/")
  const observer = vi.fn()
  old.on("private-message", observer)
  resetAppSockets()
  old.emit("private-message", {})
  expect(observer).not.toHaveBeenCalled()
  expect(old.connected).toBe(false)
  expect(openAppSocket("/")).not.toBe(old)
})

test("socket auth reads the latest access token for every handshake", () => {
  const socket = openAppSocket("/")
  const credentials: unknown[] = []
  localStorage.setItem("accessToken", "first")
  const auth = socket.auth
  if (typeof auth !== "function") throw new Error("Expected a dynamic authentication callback")
  auth((value: unknown) => credentials.push(value))
  localStorage.setItem("accessToken", "rotated")
  auth((value: unknown) => credentials.push(value))
  expect(credentials).toEqual([{ access_token: "first" }, { access_token: "rotated" }])
})

test("expired socket auth coalesces recovery and cannot revive a closed account", async () => {
  let finish = () => {}
  let requests = 0
  server.use(
    http.get("http://localhost:16000/api/v1/auth/user/info", async () => {
      requests++
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return HttpResponse.json({ code: 0, message: "OK", data: { id: "old" } })
    }),
  )
  const one = openAppSocket("/")
  const two = openAppSocket("/worker")
  one.disconnect()
  two.disconnect()
  one.emit("connect_error", new Error("token_expired"))
  two.emit("connect_error", new Error("token_expired"))
  await waitFor(() => expect(requests).toBe(1))
  resetAppSockets()
  finish()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(one.connected).toBe(false)
  expect(two.connected).toBe(false)
})

test("an expired connection recovers after a temporary HTTP failure", async () => {
  let attempts = 0
  server.use(
    http.get("http://localhost:16000/api/v1/auth/user/info", () => {
      attempts++
      return HttpResponse.json(
        attempts === 1
          ? { code: 15001, message: "Temporary failure", data: null }
          : { code: 0, message: "OK", data: { id: "current" } },
      )
    }),
  )
  const socket = openAppSocket("/")
  socket.disconnect()
  socket.emit("connect_error", new Error("token_expired"))
  await waitFor(() => expect(socket.connected).toBe(true), { timeout: 4000 })
  expect(attempts).toBe(2)
})

test("reopening a namespace does not let its previous recovery reconnect the new owner", async () => {
  let finish = () => {}
  let completed = false
  let requested = false
  server.use(
    http.get("http://localhost:16000/api/v1/auth/user/info", async () => {
      requested = true
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      completed = true
      return HttpResponse.json({ code: 0, message: "OK", data: { id: "current" } })
    }),
  )
  const old = openAppSocket("/")
  old.disconnect()
  old.emit("connect_error", new Error("token_expired"))
  await waitFor(() => expect(requested).toBe(true))
  closeAppSocket(old)
  const next = openAppSocket("/")
  next.disconnect()
  finish()
  await waitFor(() => expect(completed).toBe(true))
  await new Promise((resolve) => setTimeout(resolve, 25))
  expect(next.connected).toBe(false)
})

test("a server outage lasting three recovery attempts still reconnects when it recovers", async () => {
  let attempts = 0
  server.use(
    http.get("http://localhost:16000/api/v1/auth/user/info", () => {
      attempts++
      return HttpResponse.json(
        attempts <= 3
          ? { code: 15001, message: "Temporary failure", data: null }
          : { code: 0, message: "OK", data: { id: "current" } },
      )
    }),
  )
  const socket = openAppSocket("/")
  socket.disconnect()
  socket.emit("connect_error", new Error("token_expired"))
  await waitFor(() => expect(socket.connected).toBe(true), { timeout: 8500 })
  expect(attempts).toBe(4)
})
