import log from "electron-log"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"

export class LoggerService implements IService {
  readonly id = "logger"

  constructor(_container: ServiceContainer) {}

  async onReady(): Promise<void> {
    log.transports.file.maxSize = 10 * 1024 * 1024
    log.transports.file.format = "{y}-{m}-{d} {h}:{i}:{s} [{level}] {text}"
  }

  info(msg: string, ...args: unknown[]): void {
    log.info(msg, ...args)
  }

  warn(msg: string, ...args: unknown[]): void {
    log.warn(msg, ...args)
  }

  error(msg: string, ...args: unknown[]): void {
    log.error(msg, ...args)
  }

  debug(msg: string, ...args: unknown[]): void {
    log.debug(msg, ...args)
  }
}
