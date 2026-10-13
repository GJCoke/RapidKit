// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { useBannerStore } from "@/store/modules/banner"
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/service/api", () => ({ fetchGetTopBanner: api.get }))
const start = Date.parse("2026-10-10T00:00:00Z")
function response(id = "active", overrides: Record<string, unknown> = {}) {
  return {
    data: {
      revision: 2,
      serverNow: new Date(start).toISOString(),
      nextChangeAt: new Date(start + 5_000).toISOString(),
      current: {
        id,
        title: "notice",
        content: "body",
        level: "warning",
        contentMode: "raw",
        publishedAt: new Date(start).toISOString(),
        expireAt: new Date(start + 5_000).toISOString(),
      },
      ...overrides,
    },
    error: null,
  }
}
let store: ReturnType<typeof useBannerStore>
beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(start - 3_600_000)
  api.get.mockReset()
  api.get.mockResolvedValue(response())
  store = useBannerStore()
})
afterEach(() => {
  store.reset()
  vi.useRealTimers()
})
async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}
describe("global announcement session and validity", () => {
  it("does not poll an unlimited banner while idle, but still refreshes on realtime changes", async () => {
    const unlimited = response("active", { nextChangeAt: null })
    unlimited.data.current.expireAt = null as unknown as string
    api.get.mockResolvedValue(unlimited)
    store.start("account")
    await settle()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(store.current?.id).toBe("active")
    expect(api.get).toHaveBeenCalledTimes(1)

    api.get.mockResolvedValue(
      response("replacement", {
        revision: 3,
        serverNow: new Date(start + 90_000).toISOString(),
        nextChangeAt: null,
        current: { ...unlimited.data.current, id: "replacement" },
      }),
    )
    store.invalidate(3)
    await settle()
    expect(store.current?.id).toBe("replacement")
  })

  it("keeps a valid banner visible during a manual refresh and after a request failure", async () => {
    const unlimited = response("active", { nextChangeAt: null })
    unlimited.data.current.expireAt = null as unknown as string
    api.get.mockResolvedValue(unlimited)
    store.start("account")
    await settle()
    let finish!: (value: unknown) => void
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = store.refresh()
    expect(store.loading).toBe(true)
    expect(store.current?.id).toBe("active")
    finish({ data: null, error: { message: "offline" } })
    await pending
    expect(store.loading).toBe(false)
    expect(store.current?.id).toBe("active")
  })

  it("uses server time, removes an expired banner even if the refresh fails, and never affects inbox", async () => {
    store.start("session")
    await settle()
    expect(store.current?.id).toBe("active")
    api.get.mockResolvedValue({ data: null, error: { message: "offline" } })
    await vi.advanceTimersByTimeAsync(5_100)
    expect(store.current).toBeNull()
  })
  it("discards late responses from the previous account", async () => {
    let resolve!: (value: unknown) => void
    api.get.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    store.start("old-account")
    store.reset()
    store.start("new-account")
    await settle()
    resolve(response("private-old"))
    await settle()
    expect(store.current?.id).toBe("active")
    store.reset()
    expect(store.current).toBeNull()
  })
  it("discards an older concurrent response and refetches on realtime revision", async () => {
    store.start("account")
    await settle()
    let resolve!: (value: unknown) => void
    api.get.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const old = store.refresh()
    api.get.mockResolvedValue(response("new", { revision: 4 }))
    store.invalidate(4)
    await settle()
    resolve(response("old", { revision: 3 }))
    await old
    expect(store.current?.id).toBe("new")
  })
  it("refetches at an upcoming boundary even when there is no active banner", async () => {
    api.get.mockResolvedValueOnce(response("unused", { current: null }))
    store.start("account")
    await settle()
    expect(store.current).toBeNull()
    api.get.mockResolvedValue(
      response("scheduled", {
        serverNow: new Date(start + 5_010).toISOString(),
        nextChangeAt: null,
        current: {
          id: "scheduled",
          contentMode: "raw",
          level: "info",
          publishAt: new Date(start + 5_000).toISOString(),
        },
      }),
    )
    await vi.advanceTimersByTimeAsync(5_100)
    expect(store.current?.id).toBe("scheduled")
  })
})

it("stops showing an old unlimited banner at a scheduled boundary even when offline", async () => {
  const result = response()
  result.data.current.expireAt = null as unknown as string
  api.get.mockResolvedValueOnce(result)
  store.start("account")
  await settle()
  expect(store.current?.id).toBe("active")
  api.get.mockResolvedValue({ data: null, error: { message: "offline" } })
  await vi.advanceTimersByTimeAsync(5_100)
  expect(store.current).toBeNull()
})

it("hides an invalidated old revision until the updated announcement is available", async () => {
  store.start("account")
  await settle()
  api.get.mockResolvedValue({ data: null, error: { message: "offline" } })
  store.invalidate(3)
  expect(store.current).toBeNull()
  await settle()
  expect(store.current).toBeNull()
})

it("accounts for response latency and never moves the calibrated server clock backwards", async () => {
  let resolve!: (value: unknown) => void
  api.get.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  store.start("account")
  await vi.advanceTimersByTimeAsync(20_000)
  resolve(response())
  await settle()
  expect(store.current).toBeNull()
  api.get.mockResolvedValue(response("stale-server-clock", { nextChangeAt: null }))
  await store.refresh()
  expect(store.current).toBeNull()
})
