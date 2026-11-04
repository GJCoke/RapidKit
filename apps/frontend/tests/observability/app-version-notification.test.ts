// @vitest-environment jsdom
import { createApp, h } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { setupAppVersionNotification } from "@/plugins/app"
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
let app: ReturnType<typeof createApp> | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv("PROD", true)
  vi.stubEnv("VITE_AUTOMATICALLY_DETECT_UPDATE", "Y")
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => '<meta name="buildTime" content="new-deployment">' })),
  )
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it("uses a wrapping full-width action row and keeps defer and refresh functional", async () => {
  const destroy = vi.fn(),
    create = vi.fn((_options: unknown) => ({ destroy })),
    reload = vi.fn()
  window.$notification = { create } as any
  vi.stubGlobal("location", { reload })
  setupAppVersionNotification()
  await vi.advanceTimersByTimeAsync(180000)
  expect(create).toHaveBeenCalledOnce()
  const options = create.mock.calls[0][0] as any
  const root = document.createElement("div")
  app = createApp({ render: options.action })
  app.mount(root)
  const actions = root.firstElementChild as HTMLElement
  expect(actions.style.width).toBe("100%")
  expect(actions.style.flexWrap).toBe("wrap")
  const buttons = [...root.querySelectorAll("button")]
  expect(buttons.every((b) => b.style.flexShrink === "0")).toBe(true)
  buttons[1].click()
  expect(reload).toHaveBeenCalledOnce()
  buttons[0].click()
  expect(destroy).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(180000)
  expect(create).toHaveBeenCalledTimes(2)
  delete window.$notification
})
