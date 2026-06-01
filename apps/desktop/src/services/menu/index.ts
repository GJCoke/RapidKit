import { Menu, type MenuItemConstructorOptions } from "electron"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"

export class MenuService implements IService {
  readonly id = "menu"

  constructor(_container: ServiceContainer) {}

  async onReady(): Promise<void> {
    const template = this.buildTemplate()
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  private buildTemplate(): MenuItemConstructorOptions[] {
    const isMac = process.platform === "darwin"
    return [
      ...(isMac ? [{ role: "appMenu" as const }] : []),
      { role: "fileMenu" as const },
      { role: "editMenu" as const },
      { role: "viewMenu" as const },
      { role: "windowMenu" as const },
    ]
  }
}
