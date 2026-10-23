// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { queueWorker, queueWorkerId } from "@test/setup/queue-fixtures"
import { queueKeys } from "@/services/hooks/use-queue-dashboard"
import { useWorkerCommands } from "@/services/hooks/use-worker-commands"
const base = "http://localhost:16000/api/v1/workers",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function setup() {
  useAuthStore.getState().setToken("access", "commands-session")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      isAdmin: true,
      roles: [],
      buttons: [],
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient(),
    session = getAuthSession()
  client.setQueryData(queueKeys.workers(session), [queueWorker()])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, session, wrapper }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("worker commands are single-flight across callers and unsuccessful acknowledgements never count as success", async () => {
  const { wrapper } = setup()
  let calls = 0,
    release!: () => void,
    success = false
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.post(`${base}/:id/ping`, async () => {
      calls++
      if (calls === 1) await gate
      return reply({ success, message: "Result" })
    }),
  )
  const one = renderHook(useWorkerCommands, { wrapper }),
    two = renderHook(useWorkerCommands, { wrapper })
  let pending!: Promise<boolean>
  act(() => {
    pending = one.result.current.run(queueWorkerId, { type: "ping" })
  })
  await waitFor(() => expect(calls).toBe(1))
  expect(two.result.current.isPending(queueWorkerId)).toBe(true)
  await act(async () => expect(await two.result.current.run(queueWorkerId, { type: "ping" })).toBe(false))
  expect(calls).toBe(1)
  await act(async () => {
    release()
    expect(await pending).toBe(false)
  })
  success = true
  await act(async () => expect(await one.result.current.run(queueWorkerId, { type: "ping" })).toBe(true))
  expect(calls).toBe(2)
})
test("fresh permissions, worker heartbeat and validated pool/queue arguments guard every POST", async () => {
  const { wrapper, client, session } = setup()
  let calls = 0
  server.use(
    http.post(`${base}/:id/*`, () => {
      calls++
      return reply({ success: true })
    }),
  )
  const { result } = renderHook(useWorkerCommands, { wrapper })
  await act(async () => {
    expect(await result.current.run(queueWorkerId, { type: "shrink", n: 4 })).toBe(false)
    expect(await result.current.run(queueWorkerId, { type: "grow", n: 1.2 })).toBe(false)
    expect(await result.current.run(queueWorkerId, { type: "add", queue: " celery " })).toBe(false)
    expect(await result.current.run(queueWorkerId, { type: "add", queue: " " })).toBe(false)
  })
  client.setQueryData(queueKeys.workers(session), [queueWorker({ lastHeartbeat: "2026-01-01T00:00:00Z" })])
  await act(async () => expect(await result.current.run(queueWorkerId, { type: "ping" })).toBe(false))
  expect(calls).toBe(0)
  client.setQueryData(queueKeys.workers(session), [queueWorker()])
  useAuthStore.setState((state) => ({
    userInfo: state.userInfo ? { ...state.userInfo, isAdmin: false, buttons: ["worker:read", "task:stats"] } : null,
  }))
  await act(async () => expect(await result.current.run(queueWorkerId, { type: "ping" })).toBe(false))
  expect(calls).toBe(0)
})
test("late old-account command responses and unmounted retained handlers never affect replacement caches", async () => {
  const { wrapper, client } = setup()
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.post(`${base}/:id/ping`, async () => {
      calls++
      await gate
      return reply({ success: true })
    }),
  )
  const old = renderHook(useWorkerCommands, { wrapper })
  let pending!: Promise<boolean>
  act(() => {
    pending = old.result.current.run(queueWorkerId, { type: "ping" })
  })
  await waitFor(() => expect(calls).toBe(1))
  const retained = old.result.current.run
  old.unmount()
  useAuthStore.getState().setToken("new-access", "new-commands-session")
  const next = getAuthSession()
  client.clear()
  client.setQueryData(queueKeys.workers(next), [queueWorker({ concurrency: 9 })])
  await act(async () => {
    release()
    expect(await pending).toBe(false)
    expect(await retained(queueWorkerId, { type: "ping" })).toBe(false)
  })
  expect(client.getQueryData(queueKeys.workers(next))).toEqual([expect.objectContaining({ concurrency: 9 })])
  expect(calls).toBe(1)
})
test("current detail concurrency bounds shrink operations and queue names are trimmed before sending", async () => {
  const { wrapper, client, session } = setup(),
    bodies: unknown[] = []
  client.setQueryData(
    [...queueKeys.worker(session, queueWorkerId), "detail"],
    queueWorker({ runtimeConcurrency: 2, activeQueues: ["celery", "critical"] }),
  )
  server.use(
    http.post(`${base}/:id/*`, async ({ request }) => {
      bodies.push(await request.json())
      return reply({ success: true })
    }),
  )
  const { result } = renderHook(useWorkerCommands, { wrapper })
  await act(async () => {
    expect(await result.current.run(queueWorkerId, { type: "shrink", n: 2 })).toBe(false)
    expect(await result.current.run(queueWorkerId, { type: "add", queue: " critical " })).toBe(false)
    expect(await result.current.run(queueWorkerId, { type: "add", queue: " new-queue " })).toBe(true)
  })
  expect(bodies).toEqual([{ queue: "new-queue" }])
})

test("card shutdown follows the source online status rule while offline workers cannot be stopped", async () => {
  const { wrapper, client, session } = setup()
  let calls = 0
  server.use(
    http.post(`${base}/:id/shutdown`, () => {
      calls++
      return reply({ success: true })
    }),
  )
  client.setQueryData(queueKeys.workers(session), [queueWorker({ lastHeartbeat: "2026-01-01T00:00:00Z" })])
  const { result } = renderHook(useWorkerCommands, { wrapper })
  await act(async () => expect(await result.current.run(queueWorkerId, { type: "shutdown" })).toBe(true))
  expect(calls).toBe(1)
  client.setQueryData(queueKeys.workers(session), [queueWorker({ status: "2" })])
  await act(async () => expect(await result.current.run(queueWorkerId, { type: "shutdown" })).toBe(false))
  expect(calls).toBe(1)
})
