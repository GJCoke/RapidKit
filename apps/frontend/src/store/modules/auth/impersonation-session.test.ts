import { beforeEach, describe, expect, it, vi } from "vitest"

const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@/utils/storage", () => ({
  localStg: {
    get: (key: string) => storage.get(key) ?? null,
    set: (key: string, value: unknown) => storage.set(key, value),
    remove: (key: string) => storage.delete(key),
  },
}))
import { createImpersonationSession } from "./impersonation-session"
import { beginImpersonationStorage } from "./impersonation-storage"

const created = {
  accessToken: "simulated",
  sessionId: "sid",
  subject: { id: "user", name: "User", username: "user1" },
  expiresAt: "2099-01-01T00:00:00Z",
}

beforeEach(() => {
  storage.clear()
  storage.set("token", "admin")
  storage.set("refreshToken", "refresh")
})

function harness() {
  const events: string[] = []
  const deps = {
    create: vi.fn(async () => ({ data: created, error: null })),
    validate: vi.fn(),
    stop: vi.fn(async () => {}),
    clearRuntime: vi.fn(async () => {
      events.push("clear")
    }),
    loadIdentity: vi.fn(async (_current?: () => boolean) => {
      events.push(String(storage.get("token")))
      return true
    }),
    navigate: vi.fn(async (path: string) => {
      events.push(path)
    }),
    login: vi.fn(async () => {
      events.push("login")
    }),
    reconnect: vi.fn(() => {
      events.push("connect")
    }),
  }
  return { deps, events, session: createImpersonationSession(deps) }
}

describe("identity transition coordinator", () => {
  it("enters once, clears runtime, loads subject, navigates then reconnects", async () => {
    const { deps, session, events } = harness()
    const results = await Promise.all([
      session.enter({ targetUserId: "user" }, "/manage/user"),
      session.enter({ targetUserId: "user" }, "/manage/user"),
    ])
    expect(results).toEqual([true, true])
    expect(deps.create).toHaveBeenCalledOnce()
    expect(events).toEqual(["clear", "simulated", "/", "connect"])
    expect(storage.get("impersonatorToken")).toBe("admin")
    expect(storage.has("refreshToken")).toBe(false)
  })

  it("restores once despite an offline stop endpoint", async () => {
    beginImpersonationStorage(created, "/manage/user")
    const { deps, session, events } = harness()
    deps.stop.mockRejectedValue(new Error("offline"))
    await Promise.all([session.stop(), session.stop()])
    expect(deps.stop).toHaveBeenCalledOnce()
    expect(events).toEqual(["clear", "admin", "/manage/user", "connect"])
    expect(storage.get("refreshToken")).toBe("refresh")
  })

  it("restores after target identity loading fails", async () => {
    const { deps, session, events } = harness()
    deps.loadIdentity.mockResolvedValueOnce(false)
    expect(await session.enter({ targetUserId: "user" }, "/manage/user")).toBe(false)
    expect(storage.get("token")).toBe("admin")
    expect(events).toEqual(["clear", "clear", "admin", "/manage/user", "connect"])
  })

  it("clears expired administrator credentials and goes to login", async () => {
    beginImpersonationStorage(created, "/manage/user")
    const { deps, session, events } = harness()
    deps.loadIdentity.mockResolvedValue(false)
    await session.stop()
    expect(events).toEqual(["clear", "login"])
    expect(storage.has("token")).toBe(false)
    expect(storage.has("refreshToken")).toBe(false)
    expect(deps.reconnect).not.toHaveBeenCalled()
  })

  it("stop supersedes a pending enter load without deadlocking or reconnecting subject", async () => {
    const { deps, session, events } = harness()
    let finish!: (value: boolean) => void
    let owner: (() => boolean) | undefined
    deps.loadIdentity.mockImplementationOnce((current) => {
      owner = current
      return new Promise<boolean>((resolve) => {
        finish = resolve
      })
    })
    const enter = session.enter({ targetUserId: "user" }, "/manage/user")
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
    await session.stop()
    expect(owner?.()).toBe(false)
    finish(true)
    expect(await enter).toBe(false)
    expect(events).toEqual(["clear", "clear", "admin", "/manage/user", "connect"])
    expect(storage.get("token")).toBe("admin")
  })

  it("logout cancels an in-flight create result", async () => {
    const { deps, session } = harness()
    let finish!: (value: { data: typeof created; error: null }) => void
    deps.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const enter = session.enter({ targetUserId: "user" }, "/")
    session.cancel()
    storage.clear()
    finish({ data: created, error: null })
    expect(await enter).toBe(false)
    expect(storage.size).toBe(0)
    expect(deps.loadIdentity).not.toHaveBeenCalled()
  })
})
