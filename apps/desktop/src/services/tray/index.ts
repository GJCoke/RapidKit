import { Tray, Menu, nativeImage } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"
import type { WindowService } from "../window"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class TrayService implements IService {
  readonly id = "tray"
  private tray: Tray | null = null
  private windowService: WindowService

  constructor(container: ServiceContainer) {
    this.windowService = container.get<WindowService>("window")
  }

  async onReady(): Promise<void> {
    const iconPath = path.join(
      __dirname,
      "../../../resources",
      process.platform === "darwin" ? "tray-icon@2x.png" : "tray-icon.png",
    )
    const icon = nativeImage.createFromPath(iconPath)
    this.tray = new Tray(icon)
    this.tray.setToolTip("RapidKit")
    this.tray.setContextMenu(this.buildMenu())
    this.tray.on("click", () => {
      this.windowService.main?.show()
    })
  }

  async onDestroy(): Promise<void> {
    this.tray?.destroy()
    this.tray = null
  }

  private buildMenu(): Menu {
    return Menu.buildFromTemplate([
      { label: "Show", click: () => this.windowService.main?.show() },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ])
  }
}
