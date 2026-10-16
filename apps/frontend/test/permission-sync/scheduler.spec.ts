import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPermissionSync } from "@/store/modules/auth/permission-sync"

function setup(user = { isAdmin: false, roles: ["editor"] }) {
  let release: () => void = () => {}
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const sync = createPermissionSync({ getUser: () => user, refresh, random: () => 0.5, maxDelay: 3000 })
  return {
    sync,
    refresh,
    finish: async () => {
      release()
      await vi.advanceTimersByTimeAsync(0)
    },
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("permission sync scheduler", () => {
  it("ignores role changes that do not touch the user's roles", async () => {
    const { sync, refresh } = setup()
    sync.signal({ scope: "roles", roles: ["viewer"], revision: 1 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("admins only react to menu changes", async () => {
    const { sync, refresh } = setup({ isAdmin: true, roles: [] })
    sync.signal({ scope: "user", revision: 1 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).not.toHaveBeenCalled()
    sync.signal({ scope: "menu", revision: 2 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("spreads the refresh by a random delay", async () => {
    const { sync, refresh } = setup()
    sync.signal({ scope: "roles", roles: ["editor"], revision: 1 })
    await vi.advanceTimersByTimeAsync(1499)
    expect(refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("drops stale revisions", async () => {
    const { sync, refresh, finish } = setup()
    sync.signal({ scope: "user", revision: 5 })
    await vi.advanceTimersByTimeAsync(1500)
    await finish()
    sync.signal({ scope: "user", revision: 5 })
    sync.signal({ scope: "user", revision: 4 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("an unrelated change with the same revision does not mask a relevant one", async () => {
    const { sync, refresh } = setup()
    sync.signal({ scope: "roles", roles: ["viewer"], revision: 7 })
    sync.signal({ scope: "roles", roles: ["editor"], revision: 7 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("coalesces signals while pending or running into one follow-up", async () => {
    const { sync, refresh, finish } = setup()
    sync.signal({ scope: "user", revision: 1 })
    sync.signal({ scope: "menu", revision: 2 })
    await vi.advanceTimersByTimeAsync(1500)
    expect(refresh).toHaveBeenCalledTimes(1)
    sync.signal({ scope: "menu", revision: 3 })
    sync.signal({ scope: "menu", revision: 4 })
    expect(refresh).toHaveBeenCalledTimes(1)
    await finish()
    expect(refresh).toHaveBeenCalledTimes(2)
    await finish()
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("throttles fallback triggers", async () => {
    const { sync, refresh, finish } = setup()
    sync.trigger()
    expect(refresh).toHaveBeenCalledTimes(1)
    await finish()
    sync.trigger()
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    sync.trigger()
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("reset cancels a pending refresh", async () => {
    const { sync, refresh } = setup()
    sync.signal({ scope: "user", revision: 1 })
    sync.reset()
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
