import { ipcMain, type BrowserWindow } from "electron"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"
import type { IpcChannelMap } from "./channels"

export type { IpcChannelMap } from "./channels"

export class IpcService implements IService {
  readonly id = "ipc"

  constructor(_container: ServiceContainer) {}

  handle<K extends keyof IpcChannelMap>(
    channel: K,
    handler: (...args: IpcChannelMap[K]["args"]) => Promise<IpcChannelMap[K]["return"]>,
  ): void {
    ipcMain.handle(channel, (_event, ...args) => handler(...(args as IpcChannelMap[K]["args"])))
  }

  send<K extends keyof IpcChannelMap>(window: BrowserWindow, channel: K, ...args: IpcChannelMap[K]["args"]): void {
    window.webContents.send(channel, ...args)
  }
}
