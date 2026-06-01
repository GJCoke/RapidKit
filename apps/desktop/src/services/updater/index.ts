import pkg from "electron-updater"
const { autoUpdater } = pkg
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"
import type { LoggerService } from "../logger"
import type { IpcService } from "../ipc"
import type { WindowService } from "../window"

export class UpdaterService implements IService {
  readonly id = "updater"
  private logger: LoggerService
  private ipc: IpcService
  private windowService: WindowService

  constructor(container: ServiceContainer) {
    this.logger = container.get<LoggerService>("logger")
    this.ipc = container.get<IpcService>("ipc")
    this.windowService = container.get<WindowService>("window")
  }

  async onReady(): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      this.logger.debug("Skipping auto-updater in development mode")
      return
    }

    autoUpdater.autoDownload = false

    autoUpdater.on("update-available", (info: { version: string }) => {
      this.logger.info("Update available: {}", info.version)
      const win = this.windowService.main
      if (win) {
        this.ipc.send(win, "update:available", info.version)
      }
    })

    autoUpdater.on("download-progress", (progress: { percent: number }) => {
      const win = this.windowService.main
      if (win) {
        this.ipc.send(win, "update:progress", progress.percent)
      }
    })

    autoUpdater.on("error", (err: Error) => {
      this.logger.error("Auto-updater error: {}", err.message)
    })

    autoUpdater.checkForUpdates().catch((err: Error) => {
      this.logger.error("Failed to check for updates: {}", err.message)
    })
  }
}
