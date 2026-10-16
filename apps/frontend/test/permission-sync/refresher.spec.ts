import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPermissionRefresher } from "@/store/modules/auth/permission-refresh"

interface Snapshot {
  id: number
  canAccess: boolean
}

function setup(responses: (Snapshot | null)[]) {
  const fetchLatest = vi.fn(async () => (responses.length ? responses.shift()! : null))
  const apply = vi.fn(async () => {})
  let confirmCallback: (() => void) | null = null
  const confirm = vi.fn((onConfirm: () => void) => {
    confirmCallback = onConfirm
  })
  const refresher = createPermissionRefresher<Snapshot>({
    fetchLatest,
    canAccessCurrent: (s) => s.canAccess,
    apply,
    confirm,
    retryDelay: 5000,
  })
  return { refresher, fetchLatest, apply, confirm, ok: () => confirmCallback?.() }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("permission refresher", () => {
  it("applies silently when the current page stays accessible", async () => {
    const { refresher, apply, confirm } = setup([{ id: 1, canAccess: true }])
    await refresher.refresh()
    expect(apply).toHaveBeenCalledWith({ id: 1, canAccess: true }, false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it("asks before leaving and applies only after confirmation", async () => {
    const { refresher, apply, confirm, ok } = setup([{ id: 1, canAccess: false }])
    await refresher.refresh()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(apply).not.toHaveBeenCalled()
    ok()
    expect(apply).toHaveBeenCalledWith({ id: 1, canAccess: false }, true)
  })

  it("replaces the pending snapshot while the dialog is open", async () => {
    const { refresher, apply, confirm, ok } = setup([
      { id: 1, canAccess: false },
      { id: 2, canAccess: true },
    ])
    await refresher.refresh()
    await refresher.refresh()
    expect(confirm).toHaveBeenCalledTimes(1)
    ok()
    expect(apply).toHaveBeenCalledWith({ id: 2, canAccess: true }, false)
  })

  it("retries once after a failure and then gives up", async () => {
    const { refresher, fetchLatest, apply } = setup([null, null])
    const done = refresher.refresh()
    await vi.advanceTimersByTimeAsync(5000)
    await done
    expect(fetchLatest).toHaveBeenCalledTimes(2)
    expect(apply).not.toHaveBeenCalled()
  })

  it("ignores confirmation after reset", async () => {
    const { refresher, apply, ok } = setup([{ id: 1, canAccess: false }])
    await refresher.refresh()
    refresher.reset()
    ok()
    expect(apply).not.toHaveBeenCalled()
  })
})
