import { BrowserWindow, type BrowserWindowConstructorOptions } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"
import type { LoggerService } from "../logger"
import type { IpcService } from "../ipc"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface WindowConfig {
  id: string
  url: string
  options?: BrowserWindowConstructorOptions
  singleton?: boolean
}

export class WindowService implements IService {
  readonly id = "window"
  private windows = new Map<string, BrowserWindow>()
  private logger: LoggerService
  private ipc: IpcService

  constructor(container: ServiceContainer) {
    this.logger = container.get<LoggerService>("logger")
    this.ipc = container.get<IpcService>("ipc")
  }

  async open(config: WindowConfig): Promise<BrowserWindow> {
    if (config.singleton !== false) {
      const existing = this.windows.get(config.id)
      if (existing && !existing.isDestroyed()) {
        existing.focus()
        return existing
      }
    }

    const win = new BrowserWindow({
      ...this.getDefaults(),
      ...config.options,
      webPreferences: {
        preload: path.join(__dirname, "../../preload/index.mjs"),
        contextIsolation: true,
        sandbox: true,
        ...config.options?.webPreferences,
      },
    })

    this.windows.set(config.id, win)
    win.on("closed", () => this.windows.delete(config.id))
    await win.loadURL(config.url)
    return win
  }

  get(id: string): BrowserWindow | undefined {
    return this.windows.get(id)
  }

  get main(): BrowserWindow | undefined {
    return this.windows.get("main")
  }

  closeAll(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.close()
      }
    }
  }

  async onReady(): Promise<void> {
    this.registerIpcHandlers()

    const url = process.env.VITE_DEV_SERVER_URL || "http://localhost:9527"
    const win = await this.open({ id: "main", url })
    win.once("ready-to-show", () => win.show())
    this.logger.info("Main window created")
  }

  async onDestroy(): Promise<void> {
    this.closeAll()
  }

  private getDefaults(): BrowserWindowConstructorOptions {
    return {
      width: 1200,
      height: 800,
      show: false,
      titleBarStyle: "hiddenInset",
    }
  }

  private registerIpcHandlers(): void {
    this.ipc.handle("window:minimize", async () => {
      this.main?.minimize()
    })
    this.ipc.handle("window:maximize", async () => {
      if (this.main?.isMaximized()) {
        this.main.unmaximize()
      } else {
        this.main?.maximize()
      }
    })
    this.ipc.handle("window:close", async () => {
      this.main?.close()
    })
  }
}
