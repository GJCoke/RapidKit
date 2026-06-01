import { describe, expect, it, vi } from "vitest"

const { mockHandle, mockSend } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockSend: vi.fn(),
}))

vi.mock("electron", () => ({
  ipcMain: {
    handle: mockHandle,
  },
  BrowserWindow: class {},
}))

import { IpcService } from "../../src/services/ipc"
import { ServiceContainer } from "../../src/core/container"

describe("IpcService", () => {
  it("has correct id", () => {
    const container = new ServiceContainer()
    container.register(IpcService)
    const ipc = container.get<IpcService>("ipc")
    expect(ipc.id).toBe("ipc")
  })

  it("registers a handler via ipcMain.handle", () => {
    const container = new ServiceContainer()
    container.register(IpcService)
    const ipc = container.get<IpcService>("ipc")
    const handler = vi.fn(async () => "1.0.0")
    ipc.handle("app:version", handler)
    expect(mockHandle).toHaveBeenCalledWith("app:version", expect.any(Function))
  })

  it("handler wrapper strips the event and forwards args", async () => {
    const container = new ServiceContainer()
    container.register(IpcService)
    const ipc = container.get<IpcService>("ipc")
    const handler = vi.fn(async (key: string) => key)
    ipc.handle("store:get", handler)

    const wrapper = mockHandle.mock.calls.at(-1)![1]
    const fakeEvent = {}
    const result = await wrapper(fakeEvent, "myKey")
    expect(handler).toHaveBeenCalledWith("myKey")
    expect(result).toBe("myKey")
  })

  it("send delegates to webContents.send", () => {
    const container = new ServiceContainer()
    container.register(IpcService)
    const ipc = container.get<IpcService>("ipc")
    const fakeWindow = { webContents: { send: mockSend } } as any
    ipc.send(fakeWindow, "update:available", "2.0.0")
    expect(mockSend).toHaveBeenCalledWith("update:available", "2.0.0")
  })
})
