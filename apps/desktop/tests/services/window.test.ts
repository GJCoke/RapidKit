import { describe, expect, it, vi, beforeEach } from "vitest"

const mockLoadURL = vi.fn(async () => {})
const mockClose = vi.fn()
const mockFocus = vi.fn()
const mockMinimize = vi.fn()
const mockIsMaximized = vi.fn(() => false)
const mockMaximize = vi.fn()
const mockUnmaximize = vi.fn()
const mockIsDestroyed = vi.fn(() => false)
const mockShow = vi.fn()
const mockOn = vi.fn()
const mockOnce = vi.fn()
const mockWebContentsSend = vi.fn()

const mockBrowserWindowInstance = {
  loadURL: mockLoadURL,
  close: mockClose,
  focus: mockFocus,
  minimize: mockMinimize,
  isMaximized: mockIsMaximized,
  maximize: mockMaximize,
  unmaximize: mockUnmaximize,
  isDestroyed: mockIsDestroyed,
  show: mockShow,
  on: mockOn,
  once: mockOnce,
  webContents: { send: mockWebContentsSend },
}

vi.mock("electron", () => {
  const MockBrowserWindow = vi.fn(function () {
    return mockBrowserWindowInstance
  })
  return {
    BrowserWindow: MockBrowserWindow,
    ipcMain: { handle: vi.fn() },
  }
})

vi.mock("node:path", () => ({
  default: { join: (...args: string[]) => args.join("/"), dirname: (p: string) => p },
}))

vi.mock("node:url", () => ({
  fileURLToPath: (u: string) => u,
}))

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: { file: { maxSize: 0, format: "" } },
  },
}))

import { WindowService } from "../../src/services/window"
import { ServiceContainer } from "../../src/core/container"
import { LoggerService } from "../../src/services/logger"
import { IpcService } from "../../src/services/ipc"

describe("WindowService", () => {
  let container: ServiceContainer

  beforeEach(() => {
    vi.clearAllMocks()
    container = new ServiceContainer()
    container.register(LoggerService)
    container.register(IpcService)
    container.register(WindowService)
  })

  it("has correct id", () => {
    const svc = container.get<WindowService>("window")
    expect(svc.id).toBe("window")
  })

  it("open creates a window and loads url", async () => {
    const svc = container.get<WindowService>("window")
    const win = await svc.open({ id: "test", url: "http://localhost:3000" })
    expect(mockLoadURL).toHaveBeenCalledWith("http://localhost:3000")
    expect(win).toBe(mockBrowserWindowInstance)
  })

  it("open with singleton returns existing window on second call", async () => {
    const svc = container.get<WindowService>("window")
    await svc.open({ id: "test", url: "http://localhost:3000" })
    await svc.open({ id: "test", url: "http://localhost:3000" })
    expect(mockFocus).toHaveBeenCalledTimes(1)
  })

  it("get returns undefined for unknown id", () => {
    const svc = container.get<WindowService>("window")
    expect(svc.get("nonexistent")).toBeUndefined()
  })

  it("main returns the window with id 'main'", async () => {
    const svc = container.get<WindowService>("window")
    await svc.open({ id: "main", url: "http://localhost:9527" })
    expect(svc.main).toBe(mockBrowserWindowInstance)
  })
})
