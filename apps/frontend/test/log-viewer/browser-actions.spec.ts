// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { copyLogs, downloadLogs } from "../../src/components/common/log-viewer/browser-actions"
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe("log browser actions", () => {
  it("copies exact filtered text and rejects clipboard failures", async () => {
    let copied = ""
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          copied = text
        },
      },
    })
    await copyLogs("[ERROR] failure\n  stack")
    expect(copied).toBe("[ERROR] failure\n  stack")
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("denied")
        },
      },
    })
    await expect(copyLogs("text")).rejects.toThrow("denied")
    vi.stubGlobal("navigator", {})
    await expect(copyLogs("text")).rejects.toThrow()
  })
  it("downloads UTF-8 text under a safe filename and releases the object URL", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("Blob", NodeBlob)
    let downloaded: Blob | undefined
    const revoked: string[] = []
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        downloaded = blob
        return "blob:logs"
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    })
    let name = "",
      href = ""
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download
      href = this.href
    })
    downloadLogs("日志\n  stack", "folder/run.log")
    expect(await downloaded!.text()).toBe("日志\n  stack")
    expect(downloaded!.type).toBe("text/plain;charset=utf-8")
    expect(name).toBe("folderrun.log")
    expect(href).toBe("blob:logs")
    expect(document.querySelector("a")).toBeNull()
    await vi.runAllTimersAsync()
    expect(revoked).toEqual(["blob:logs"])
  })
})
