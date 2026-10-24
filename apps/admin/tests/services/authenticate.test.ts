import assert from "node:assert/strict"
import { test } from "vitest"
import { authenticate } from "@/services/authenticate"

const userInfo = {
  id: "user-1",
  createTime: "2026-09-07 10:00:00",
  updateTime: "2026-09-07 10:00:00",
  name: "Admin",
  email: "admin@example.com",
  username: "admin",
  isAdmin: true,
  roles: ["admin"],
  buttons: [],
}

test("authentication encrypts the password before storing credentials and user info", async () => {
  const calls: string[] = []
  const result = await authenticate(
    { username: "admin", password: "plain-password" },
    {
      getSession: () => 0,
      fetchPublicKey: async () => {
        calls.push("public-key")
        return { data: "PUBLIC KEY", error: null }
      },
      encrypt: async (publicKey, password) => {
        calls.push(`encrypt:${publicKey}:${password}`)
        return "encrypted-password"
      },
      login: async (credentials) => {
        calls.push(`login:${credentials.username}:${credentials.password}`)
        return { data: { accessToken: "access", refreshToken: "refresh" }, error: null }
      },
      setToken: (accessToken, refreshToken) => calls.push(`tokens:${accessToken}:${refreshToken}`),
      clearAuth: () => calls.push("clear-auth"),
      fetchUserInfo: async () => {
        calls.push("user-info")
        return { data: userInfo, error: null }
      },
      setUserInfo: (info) => calls.push(`user:${info.username}`),
    },
  )

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [
    "public-key",
    "encrypt:PUBLIC KEY:plain-password",
    "login:admin:encrypted-password",
    "tokens:access:refresh",
    "user-info",
    "user:admin",
  ])
})

test("authentication stops when public key retrieval fails", async () => {
  let loginCalled = false
  const failure = new Error("public key unavailable")
  const result = await authenticate(
    { username: "admin", password: "password" },
    {
      getSession: () => 0,
      fetchPublicKey: async () => ({ data: null, error: failure }),
      encrypt: async () => "encrypted",
      login: async () => {
        loginCalled = true
        return { data: null, error: null }
      },
      setToken: () => undefined,
      clearAuth: () => undefined,
      fetchUserInfo: async () => ({ data: null, error: null }),
      setUserInfo: () => undefined,
    },
  )

  assert.equal(result.ok, false)
  assert.equal(loginCalled, false)
})

test("authentication rejects missing login data and missing user info", async () => {
  let storedTokens = 0
  let clearedAuth = 0
  const base = {
    getSession: () => 0,
    fetchPublicKey: async () => ({ data: "PUBLIC KEY", error: null }),
    encrypt: async () => "encrypted",
    setToken: () => {
      storedTokens += 1
    },
    clearAuth: () => {
      clearedAuth += 1
    },
    setUserInfo: () => undefined,
  }

  const missingTokens = await authenticate(
    { username: "admin", password: "password" },
    {
      ...base,
      login: async () => ({ data: null, error: null }),
      fetchUserInfo: async () => ({ data: userInfo, error: null }),
    },
  )
  assert.equal(missingTokens.ok, false)
  assert.equal(storedTokens, 0)

  const missingUser = await authenticate(
    { username: "admin", password: "password" },
    {
      ...base,
      login: async () => ({ data: { accessToken: "access", refreshToken: "refresh" }, error: null }),
      fetchUserInfo: async () => ({ data: null, error: null }),
    },
  )
  assert.equal(missingUser.ok, false)
  assert.equal(storedTokens, 1)
  assert.equal(clearedAuth, 1)
})

test.each(["public-key", "encryption", "login", "user-info-success", "user-info-error"])(
  "an old login waiting for %s cannot change or clear a replacement identity",
  async (stage) => {
    let session = 0,
      storedTokens = 0,
      clearedAuth = 0,
      storedUsers = 0,
      loginCalls = 0
    let release!: () => void, started!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const pause = async (step: string) => {
      if (step === stage) {
        started()
        await gate
      }
    }
    const dependencies = {
      getSession: () => session,
      fetchPublicKey: async () => {
        await pause("public-key")
        return { data: "PUBLIC KEY", error: null }
      },
      encrypt: async () => {
        await pause("encryption")
        return "encrypted"
      },
      login: async () => {
        loginCalls++
        await pause("login")
        return { data: { accessToken: "old-access", refreshToken: "old-refresh" }, error: null }
      },
      setToken: () => {
        storedTokens++
        session++
      },
      clearAuth: () => {
        clearedAuth++
      },
      fetchUserInfo: async () => {
        await pause(stage === "user-info-error" ? "user-info-error" : "user-info-success")
        return stage === "user-info-error"
          ? { data: null, error: Object.assign(new Error("Identity changed"), { code: "ERR_CANCELED" }) }
          : { data: userInfo, error: null }
      },
      setUserInfo: () => {
        storedUsers++
      },
    }
    const result = authenticate({ username: "admin", password: "123456" }, dependencies)
    await ready
    session++
    release()
    assert.equal((await result).ok, false)
    assert.equal(clearedAuth, 0)
    assert.equal(storedUsers, 0)
    assert.equal(storedTokens, stage.startsWith("user-info") ? 1 : 0)
    assert.equal(loginCalls, stage === "public-key" || stage === "encryption" ? 0 : 1)
  },
)

test("a rejected user-info operation clears only the credentials this login owns", async () => {
  let cleared = 0
  const dependencies = {
    getSession: () => 1,
    fetchPublicKey: async () => ({ data: "KEY", error: null }),
    encrypt: async () => "encrypted",
    login: async () => ({ data: { accessToken: "access", refreshToken: "refresh" }, error: null }),
    setToken: () => undefined,
    clearAuth: () => {
      cleared++
    },
    fetchUserInfo: async () => {
      throw new Error("transport rejected")
    },
    setUserInfo: () => undefined,
  }
  assert.equal((await authenticate({ username: "admin", password: "123456" }, dependencies)).ok, false)
  assert.equal(cleared, 1)
})
