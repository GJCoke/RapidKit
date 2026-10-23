import { afterEach, expect, test, vi } from "vitest"
import { createPermissionSync } from "@/features/auth/permission-sync"

afterEach(() => vi.useRealTimers())
test("only relevant changes refresh permissions and duplicate revisions are ignored", async () => {
  vi.useFakeTimers()
  const updates: number[] = []
  const sync = createPermissionSync({
    getUser: () => ({ isAdmin: false, roles: ["editor"] }),
    refresh: async () => {
      updates.push(1)
    },
    random: () => 0,
    maxDelay: 1,
  })
  sync.signal({ scope: "roles", roles: ["other"], revision: 1 })
  sync.signal({ scope: "roles", roles: ["editor"], revision: 1 })
  await vi.runAllTimersAsync()
  sync.signal({ scope: "roles", roles: ["editor"], revision: 1 })
  await vi.runAllTimersAsync()
  expect(updates).toEqual([1])
})
test("pending permission changes coalesce, and reset cancels the previous account", async () => {
  vi.useFakeTimers()
  const updates: number[] = []
  let release = () => {}
  const sync = createPermissionSync({
    getUser: () => ({ isAdmin: false, roles: [] }),
    refresh: () => {
      updates.push(1)
      return new Promise<void>((resolve) => {
        release = resolve
      })
    },
    random: () => 0,
    maxDelay: 1,
  })
  sync.signal({ scope: "user", revision: 1 })
  await vi.advanceTimersByTimeAsync(1)
  sync.signal({ scope: "menu", revision: 2 })
  sync.reset()
  release()
  await vi.runAllTimersAsync()
  expect(updates).toEqual([1])
})
test("administrators react to menu changes but ignore role grants", async () => {
  vi.useFakeTimers()
  const updates: number[] = []
  const sync = createPermissionSync({
    getUser: () => ({ isAdmin: true, roles: [] }),
    refresh: async () => {
      updates.push(1)
    },
    random: () => 0,
    maxDelay: 1,
  })
  sync.signal({ scope: "roles", roles: ["EDITOR"], revision: 1 })
  await vi.runAllTimersAsync()
  expect(updates).toEqual([])
  sync.signal({ scope: "user", revision: 2 })
  await vi.runAllTimersAsync()
  expect(updates).toEqual([1])
  sync.signal({ scope: "menu", revision: 3 })
  await vi.runAllTimersAsync()
  expect(updates).toEqual([1, 1])
})

test("a failed permission refresh retries without needing another revision", async () => {
  vi.useFakeTimers()
  let attempts = 0
  const sync = createPermissionSync({
    getUser: () => ({ isAdmin: false, roles: [] }),
    refresh: async () => {
      attempts++
      if (attempts === 1) throw new Error("temporary")
    },
    random: () => 0,
    maxDelay: 1,
  })
  sync.signal({ scope: "user", revision: 7 })
  await vi.advanceTimersByTimeAsync(1)
  await vi.advanceTimersByTimeAsync(5000)
  expect(attempts).toBe(2)
  sync.reset()
})
