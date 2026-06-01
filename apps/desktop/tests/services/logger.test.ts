import { describe, expect, it, vi } from "vitest"

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: {
      file: { maxSize: 0, format: "" },
    },
  },
}))

import { LoggerService } from "../../src/services/logger"
import { ServiceContainer } from "../../src/core/container"

describe("LoggerService", () => {
  it("has correct id", () => {
    const container = new ServiceContainer()
    container.register(LoggerService)
    const logger = container.get<LoggerService>("logger")
    expect(logger.id).toBe("logger")
  })

  it("delegates info to electron-log", async () => {
    const container = new ServiceContainer()
    container.register(LoggerService)
    const logger = container.get<LoggerService>("logger")
    await logger.onReady!()
    logger.info("test message", 123)

    const log = await import("electron-log")
    expect(log.default.info).toHaveBeenCalledWith("test message", 123)
  })

  it("delegates error to electron-log", async () => {
    const container = new ServiceContainer()
    container.register(LoggerService)
    const logger = container.get<LoggerService>("logger")
    await logger.onReady!()
    logger.error("error message")

    const log = await import("electron-log")
    expect(log.default.error).toHaveBeenCalledWith("error message")
  })
})
