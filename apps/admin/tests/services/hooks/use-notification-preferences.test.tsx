// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useNotificationPreferences } from "@/services/hooks/use-notification-preferences"
const base = "http://localhost:16000/api/v1/notification-preferences"
const items = [
  {
    category: "user.mention",
    nameKey: "notification.category.userMention",
    enabled: true,
    closable: true,
    reserved: false,
  },
  {
    category: "task.completed",
    nameKey: "notification.category.taskCompleted",
    enabled: true,
    closable: true,
    reserved: false,
  },
  {
    category: "system.security",
    nameKey: "notification.category.systemSecurity",
    enabled: true,
    closable: false,
    reserved: false,
  },
  {
    category: "user.invited",
    nameKey: "notification.category.userInvited",
    enabled: true,
    closable: true,
    reserved: true,
  },
]
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function setup() {
  useAuthStore.getState().setToken("access", "preferences-session")
  const client = createTestQueryClient(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  server.use(http.get(base, () => reply(items)))
  return { client, wrapper }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("loads effective categories and rejects reserved, mandatory and unknown writes", async () => {
  const { wrapper } = setup(),
    { result } = renderHook(useNotificationPreferences, { wrapper })
  let calls = 0
  server.use(
    http.put(`${base}/:category`, () => {
      calls++
      return reply(items[0])
    }),
  )
  await waitFor(() => expect(result.current.items).toHaveLength(4))
  await act(async () => {
    expect(await result.current.toggle("system.security", false)).toBe(false)
    expect(await result.current.toggle("user.invited", false)).toBe(false)
    expect(await result.current.toggle("missing", false)).toBe(false)
  })
  expect(calls).toBe(0)
})
test("optimistic updates are single-flight per category while other categories save independently", async () => {
  const { wrapper } = setup(),
    { result } = renderHook(useNotificationPreferences, { wrapper })
  let release!: () => void
  const calls: string[] = []
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.put(`${base}/:category`, async ({ params, request }) => {
      calls.push(String(params.category))
      const body = (await request.json()) as { enabled: boolean }
      if (params.category === "user.mention") await gate
      return reply({ ...items.find((i) => i.category === params.category), enabled: body.enabled })
    }),
  )
  await waitFor(() => expect(result.current.items).toHaveLength(4))
  let first!: Promise<boolean>
  act(() => {
    first = result.current.toggle("user.mention", false)
  })
  await waitFor(() => expect(result.current.isSaving("user.mention")).toBe(true))
  await waitFor(() => expect(result.current.items[0].enabled).toBe(false))
  expect(result.current.isSaving("task.completed")).toBe(false)
  await act(async () => {
    expect(await result.current.toggle("user.mention", true)).toBe(false)
    expect(await result.current.toggle("task.completed", false)).toBe(true)
  })
  expect(calls).toEqual(["user.mention", "task.completed"])
  await act(async () => {
    release()
    expect(await first).toBe(true)
  })
  expect(result.current.isSaving("user.mention")).toBe(false)
  expect(result.current.items.slice(0, 2).map((i) => i.enabled)).toEqual([false, false])
})
test("failed saves roll back only their category and can be retried", async () => {
  const { wrapper } = setup(),
    { result } = renderHook(useNotificationPreferences, { wrapper })
  let fail = true
  server.use(
    http.put(`${base}/:category`, () =>
      fail
        ? HttpResponse.json({ code: 422, message: "Preference failed", data: null })
        : reply({ ...items[0], enabled: false }),
    ),
  )
  await waitFor(() => expect(result.current.items).toHaveLength(4))
  await act(async () => expect(await result.current.toggle("user.mention", false)).toBe(false))
  expect(result.current.items[0].enabled).toBe(true)
  expect(result.current.isSaving("user.mention")).toBe(false)
  fail = false
  await act(async () => expect(await result.current.toggle("user.mention", false)).toBe(true))
  expect(result.current.items[0].enabled).toBe(false)
})
test("retained handlers and late writes never update a replacement account or reopened page", async () => {
  const { wrapper, client } = setup(),
    old = renderHook(useNotificationPreferences, { wrapper })
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.put(`${base}/:category`, async () => {
      calls++
      await gate
      return reply({ ...items[0], enabled: false })
    }),
  )
  await waitFor(() => expect(old.result.current.items).toHaveLength(4))
  const retained = old.result.current.toggle
  let pending!: Promise<boolean>
  act(() => {
    pending = retained("user.mention", false)
  })
  await waitFor(() => expect(calls).toBe(1))
  old.unmount()
  useAuthStore.getState().setToken("another", "another-session")
  client.clear()
  const fresh = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(fresh.result.current.items[0]?.enabled).toBe(true))
  await act(async () => {
    release()
    expect(await pending).toBe(false)
    expect(await retained("user.mention", false)).toBe(false)
  })
  expect(fresh.result.current.items[0].enabled).toBe(true)
  expect(calls).toBe(1)
})
test("failed reads expose an error and retry recovers an empty result", async () => {
  const { wrapper } = setup()
  let fail = true
  server.use(
    http.get(base, () => (fail ? HttpResponse.json({ code: 422, message: "Read failed", data: null }) : reply([]))),
  )
  const { result } = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.items).toEqual([])
  fail = false
  await act(async () => {
    await result.current.load()
  })
  await waitFor(() => expect(result.current.failed).toBe(false))
  expect(result.current.items).toEqual([])
})

test("reopening a pending optimistic preference shows loading until a fresh server snapshot arrives", async () => {
  const { wrapper } = setup(),
    old = renderHook(useNotificationPreferences, { wrapper })
  let releaseWrite!: () => void,
    releaseRead!: () => void,
    calls = 0
  const writeGate = new Promise<void>((r) => {
      releaseWrite = r
    }),
    readGate = new Promise<void>((r) => {
      releaseRead = r
    })
  server.use(
    http.put(`${base}/:category`, async () => {
      calls++
      await writeGate
      return reply({ ...items[0], enabled: false })
    }),
  )
  await waitFor(() => expect(old.result.current.items).toHaveLength(4))
  let pending!: Promise<boolean>
  act(() => {
    pending = old.result.current.toggle("user.mention", false)
  })
  await waitFor(() => expect(calls).toBe(1))
  old.unmount()
  server.use(
    http.get(base, async () => {
      await readGate
      return reply(items)
    }),
  )
  const fresh = renderHook(useNotificationPreferences, { wrapper })
  try {
    expect(fresh.result.current.loading).toBe(true)
  } finally {
    await act(async () => {
      releaseRead()
      releaseWrite()
      await pending
    })
  }
  await waitFor(() => expect(fresh.result.current.items[0]?.enabled).toBe(true))
})
test("an old successful save refreshes a reopened same-account page after its earlier GET saw the old server value", async () => {
  const { wrapper } = setup()
  let stored = structuredClone(items),
    release!: () => void,
    writing = false,
    reads = 0
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(base, () => {
      reads++
      return reply(stored)
    }),
    http.put(`${base}/:category`, async () => {
      writing = true
      await gate
      stored = stored.map((row) => (row.category === "user.mention" ? { ...row, enabled: false } : row))
      return reply(stored[0])
    }),
  )
  const old = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(old.result.current.items).toHaveLength(4))
  let pending!: Promise<boolean>
  act(() => {
    pending = old.result.current.toggle("user.mention", false)
  })
  await waitFor(() => expect(writing).toBe(true))
  old.unmount()
  const fresh = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(reads).toBe(2))
  await waitFor(() => expect(fresh.result.current.items[0]?.enabled).toBe(true))
  await act(async () => {
    release()
    await pending
  })
  await waitFor(() => expect(fresh.result.current.items[0]?.enabled).toBe(false))
  expect(reads).toBe(3)
})
test("a permission-refresh GET captured before a successful PUT never restores its old value after cache reset", async () => {
  const { wrapper, client } = setup()
  let stored = structuredClone(items),
    releaseWrite!: () => void,
    releaseRead!: () => void,
    reads = 0,
    writing = false
  const writeGate = new Promise<void>((r) => {
      releaseWrite = r
    }),
    readGate = new Promise<void>((r) => {
      releaseRead = r
    })
  server.use(
    http.get(base, async () => {
      const snapshot = structuredClone(stored)
      if (++reads === 2) await readGate
      return reply(snapshot)
    }),
    http.put(`${base}/:category`, async () => {
      writing = true
      await writeGate
      stored = stored.map((row) => (row.category === "user.mention" ? { ...row, enabled: false } : row))
      return reply(stored[0])
    }),
  )
  const { result } = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(result.current.items).toHaveLength(4))
  let pending!: Promise<boolean>, reset!: Promise<void>
  act(() => {
    pending = result.current.toggle("user.mention", false)
  })
  await waitFor(() => expect(writing).toBe(true))
  act(() => {
    reset = client.resetQueries({ predicate: (query) => query.queryKey[0] === "notification-preferences" })
  })
  await waitFor(() => expect(reads).toBe(2))
  await act(async () => {
    releaseWrite()
    await pending
    releaseRead()
    await reset
  })
  await waitFor(() => expect(result.current.items[0]?.enabled).toBe(false))
  expect(reads).toBe(3)
})
test("a pending category remains locked across same-account page remounts while other categories can still save", async () => {
  const { wrapper } = setup()
  let release!: () => void,
    calls = 0,
    stored = structuredClone(items)
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(base, () => reply(stored)),
    http.put(`${base}/:category`, async ({ params }) => {
      calls++
      if (params.category === "user.mention") await gate
      stored = stored.map((row) => (row.category === params.category ? { ...row, enabled: false } : row))
      return reply(stored.find((row) => row.category === params.category))
    }),
  )
  const old = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(old.result.current.items).toHaveLength(4))
  let pending!: Promise<boolean>
  act(() => {
    pending = old.result.current.toggle("user.mention", false)
  })
  await waitFor(() => expect(calls).toBe(1))
  old.unmount()
  const fresh = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(fresh.result.current.items[0]?.enabled).toBe(true))
  try {
    expect(fresh.result.current.isSaving("user.mention")).toBe(true)
    await act(async () => {
      expect(await fresh.result.current.toggle("user.mention", false)).toBe(false)
      expect(await fresh.result.current.toggle("task.completed", false)).toBe(true)
    })
    expect(calls).toBe(2)
  } finally {
    await act(async () => {
      release()
      await pending
    })
  }
  await waitFor(() => expect(fresh.result.current.items[0]?.enabled).toBe(false))
  await waitFor(() => expect(fresh.result.current.isSaving("user.mention")).toBe(false))
})
test("another category save cannot discard a detached committed preference by cancelling its pending refresh", async () => {
  const { wrapper, client } = setup()
  let stored = structuredClone(items),
    reads = 0,
    writes = 0,
    releaseA!: () => void,
    releaseB!: () => void,
    releaseRead!: () => void
  const gateA = new Promise<void>((r) => {
      releaseA = r
    }),
    gateB = new Promise<void>((r) => {
      releaseB = r
    }),
    readGate = new Promise<void>((r) => {
      releaseRead = r
    })
  server.use(
    http.get(base, async () => {
      const snapshot = structuredClone(stored)
      if (++reads >= 3) await readGate
      return reply(snapshot)
    }),
    http.put(`${base}/:category`, async ({ params }) => {
      writes++
      await (params.category === "user.mention" ? gateA : gateB)
      stored = stored.map((row) => (row.category === params.category ? { ...row, enabled: false } : row))
      return reply(stored.find((row) => row.category === params.category))
    }),
  )
  const old = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(old.result.current.items).toHaveLength(4))
  let oldSave!: Promise<boolean>, newSave!: Promise<boolean>, refresh!: Promise<void>
  act(() => {
    oldSave = old.result.current.toggle("user.mention", false)
  })
  await waitFor(() => expect(writes).toBe(1))
  old.unmount()
  const fresh = renderHook(useNotificationPreferences, { wrapper })
  await waitFor(() => expect(reads).toBe(2))
  await waitFor(() => expect(fresh.result.current.loading).toBe(false))
  act(() => {
    newSave = fresh.result.current.toggle("task.completed", false)
  })
  await waitFor(() => expect(writes).toBe(2))
  act(() => releaseA())
  await waitFor(() => expect(stored[0].enabled).toBe(false))
  act(() => {
    refresh = client.invalidateQueries({ predicate: (query) => query.queryKey[0] === "notification-preferences" })
  })
  await waitFor(() => expect(reads).toBeGreaterThanOrEqual(3))
  await act(async () => {
    releaseB()
    await newSave
    releaseRead()
    await refresh
    await oldSave
  })
  await waitFor(() => expect(fresh.result.current.items.slice(0, 2).map((row) => row.enabled)).toEqual([false, false]))
})
