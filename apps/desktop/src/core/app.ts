import { app } from "electron"
import { ServiceContainer } from "./container"
import { LoggerService } from "../services/logger"
import { StoreService } from "../services/store"
import { IpcService } from "../services/ipc"
import { WindowService } from "../services/window"
import { MenuService } from "../services/menu"
import { TrayService } from "../services/tray"
import { ShortcutService } from "../services/shortcut"
import { UpdaterService } from "../services/updater"
import { CrashReporterService } from "../services/crash-reporter"

export class App {
  private container = new ServiceContainer()

  constructor() {
    // Registration order = dependency order (base services first)
    this.container.register(LoggerService)
    this.container.register(StoreService)
    this.container.register(IpcService)
    this.container.register(WindowService)
    this.container.register(MenuService)
    this.container.register(TrayService)
    this.container.register(ShortcutService)
    this.container.register(UpdaterService)
    this.container.register(CrashReporterService)
  }

  async start(): Promise<void> {
    await app.whenReady()
    await this.container.bootstrap()

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit()
      }
    })

    app.on("before-quit", async () => {
      await this.container.shutdown()
    })

    app.on("activate", () => {
      const windowService = this.container.get<WindowService>("window")
      if (!windowService.main || windowService.main.isDestroyed()) {
        const url = process.env.VITE_DEV_SERVER_URL || "http://localhost:9527"
        windowService.open({ id: "main", url })
      }
    })
  }
}
