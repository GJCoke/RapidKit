import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { AxiosError } = createRequire(new URL("../../../../packages/axios/package.json", import.meta.url))("axios")

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("DEV", true)
  vi.stubEnv("VITE_LOG_LEVEL", "")
  vi.stubEnv("VITE_STORAGE_PREFIX", "RAPIDKIT_")
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) })
  for (const level of ["debug", "info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function emitAll() {
  const { createLogger } = await import("@/utils/logger")
  const logger = createLogger("request")
  logger.debug("debug")
  logger.info("info")
  logger.warn("warn")
  logger.error("error")
}

describe("development logger", () => {
  it.each([true, false])("uses build defaults when DEV=%s", async (dev) => {
    vi.stubEnv("DEV", dev)
    await emitAll()
    expect(console.debug).toHaveBeenCalledTimes(dev ? 1 : 0)
    expect(console.info).toHaveBeenCalledTimes(dev ? 1 : 0)
    expect(console.warn).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it.each(["debug", "info", "warn", "error", "silent"])("applies env level %s", async (level) => {
    vi.stubEnv("VITE_LOG_LEVEL", level)
    await emitAll()
    const levels = ["debug", "info", "warn", "error", "silent"]
    for (const name of ["debug", "info", "warn", "error"] as const) {
      expect(console[name]).toHaveBeenCalledTimes(levels.indexOf(name) >= levels.indexOf(level) ? 1 : 0)
    }
  })

  it("uses the prefixed raw storage override once, ahead of env", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "error")
    const getItem = vi.fn(() => "info")
    vi.stubGlobal("localStorage", { getItem })
    await emitAll()
    getItem.mockReturnValue("silent")
    await emitAll()
    expect(getItem).toHaveBeenCalledExactlyOnceWith("RAPIDKIT_LOG_LEVEL")
    expect(console.debug).not.toHaveBeenCalled()
    expect(console.info).toHaveBeenCalledTimes(2)
  })

  it.each(["invalid", '"debug"'])("ignores invalid raw storage %s", async (value) => {
    vi.stubEnv("VITE_LOG_LEVEL", "warn")
    vi.stubGlobal("localStorage", { getItem: () => value })
    await emitAll()
    expect(console.info).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledOnce()
  })

  it("falls back to build defaults when env is invalid and storage is blocked", async () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_LOG_LEVEL", "invalid")
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
    })
    await emitAll()
    expect(console.info).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledOnce()
  })

  it("formats each call with time and scope, preserving ordinary objects and Error identity", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 3, 10, 20, 30, 45))
    const { createLogger } = await import("@/utils/logger")
    const logger = createLogger("permission-sync")
    const details = { reason: "reconnect" }
    const error = new Error("ordinary failure")
    logger.error("Refresh failed", details, error)
    expect(console.error).toHaveBeenCalledWith(
      "[10:20:30.045] [ERROR] [permission-sync]",
      "Refresh failed",
      details,
      error,
    )
    vi.advanceTimersByTime(1000)
    logger.info("Refreshed")
    expect(console.info).toHaveBeenCalledWith("[10:20:31.045] [INFO] [permission-sync]", "Refreshed")
  })

  it("summarizes Axios errors without headers, bodies, query, fragment or custom message", async () => {
    const { createLogger } = await import("@/utils/logger")
    const config = {
      url: "https://private-user:private-password@app.test/users?token=private-query#private-fragment",
      method: "post",
      headers: { Authorization: "private-token" },
      data: { password: "private-body" },
    }
    const error = new AxiosError(
      "private-error-body",
      "ERR_BAD_RESPONSE",
      config,
      {},
      {
        status: 503,
        headers: { "x-request-id": "abcdefghijklmnopqrstu" },
        data: { code: 7001, message: "private-response" },
        config,
      },
    )
    createLogger("request").error("Request failed", error)
    const output = vi.mocked(console.error).mock.calls[0]
    expect(output[2]).toEqual({
      method: "POST",
      path: "/users",
      status: 503,
      business_code: 7001,
      code: "ERR_BAD_RESPONSE",
      request_id: "abcdefghijklmnopqrstu",
      message: "Request failed",
    })
    expect(JSON.stringify(output)).not.toContain("private-")
  })
})
