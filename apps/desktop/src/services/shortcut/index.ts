import { globalShortcut } from "electron"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"
import type { WindowService } from "../window"

export class ShortcutService implements IService {
  readonly id = "shortcut"
  private windowService: WindowService

  constructor(container: ServiceContainer) {
    this.windowService = container.get<WindowService>("window")
  }

  async onReady(): Promise<void> {
    globalShortcut.register("CommandOrControl+Shift+R", () => {
      this.windowService.main?.show()
    })
  }

  async onDestroy(): Promise<void> {
    globalShortcut.unregisterAll()
  }
}
