// @vitest-environment jsdom

import { expect, test, vi } from "vitest"

test("initializes the browser locale store when the localStorage getter throws", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("Storage is disabled", "SecurityError")
    },
  })
  vi.resetModules()

  try {
    const { useLocaleStore } = await import("@/stores/locale")

    expect(useLocaleStore.getState().locale).toBe("zh-CN")
    expect(() => useLocaleStore.getState().setLocale("en-US")).not.toThrow()
    expect(useLocaleStore.getState().locale).toBe("en-US")
  } finally {
    if (descriptor) Object.defineProperty(window, "localStorage", descriptor)
    else delete (window as { localStorage?: Storage }).localStorage
    vi.resetModules()
  }
})
