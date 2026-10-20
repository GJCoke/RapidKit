// @vitest-environment jsdom
import { createApp } from "vue"
import { expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  close: vi.fn(),
  socket: { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() },
}))
vi.mock("socket.io-client", () => ({ io: () => state.socket }))
vi.mock("@/hooks/common/app-socket", () => ({ bindAuthRecovery: vi.fn(), closeAppSocket: state.close }))
vi.mock("@/store/modules/auth/shared", () => ({ getToken: () => "token" }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
import ChatWindow from "@/views/socketio/chat/modules/chat-window.vue"

it("releases authentication recovery before the chat hook drops its socket reference", () => {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(ChatWindow, { username: "Doraemon", group: "room" })
  try {
    app.mount(root)
    app.unmount()
    expect(state.close).toHaveBeenCalledOnce()
    expect(state.close.mock.calls[0][0]).toBe(state.socket)
  } finally {
    root.remove()
  }
})
