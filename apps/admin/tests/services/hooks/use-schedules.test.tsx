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
import {
  scheduleKeys,
  useSchedules,
  useScheduleTasks,
  useScheduleDetail,
  useScheduleOperations,
} from "@/services/hooks/use-schedules"
const base = "http://localhost:16000/api/v1/schedules",
  id = "10000000-0000-4000-8000-000000000001",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data }),
  body = {
    name: "Schedule",
    task: "sample.job",
    enabled: true,
    description: "",
    args: [],
    kwargs: {},
    schedule: { type: "interval" as const, every: 60, period: "seconds" as const },
  }
function setup(admin = true) {
  useAuthStore.getState().setToken("access", "schedule-session")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: admin,
      roles: [],
      buttons: ["schedule:read", "schedule:create", "schedule:update", "task:registered"],
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient(),
    session = getAuthSession(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  return { client, session, wrapper }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("list pagination never exposes previous query rows, and disabled filters survive", async () => {
  const { wrapper } = setup(),
    queries: Record<string, string>[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(base, async ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams)
      queries.push(query)
      if (query.page === "2") await gate
      return reply({ records: [{ id: `row-${query.page}` }], total: 60, page: Number(query.page), pageSize: 20 })
    }),
  )
  const hook = renderHook(({ page }) => useSchedules({ page, pageSize: 20, enabled: false, taskName: "sample" }), {
    wrapper,
    initialProps: { page: 1 },
  })
  await waitFor(() => expect(hook.result.current.data?.records[0].id).toBe("row-1"))
  hook.rerender({ page: 2 })
  expect(hook.result.current.data).toBeUndefined()
  await act(async () => release())
  await waitFor(() => expect(hook.result.current.data?.records[0].id).toBe("row-2"))
  expect(queries.at(-1)).toMatchObject({ enabled: "false", taskName: "sample", page: "2" })
})
test("registered tasks require task:registered rather than task:read, and cached failures lock choices", async () => {
  const { wrapper } = setup(false)
  let fail = false
  server.use(
    http.get("http://localhost:16000/api/v1/tasks/registered", () =>
      fail ? HttpResponse.json({ code: 422, message: "failed", data: null }) : reply({ tasks: [body.task] }),
    ),
  )
  const hook = renderHook(() => useScheduleTasks("opening"), { wrapper })
  await waitFor(() => expect(hook.result.current.tasks).toEqual([body.task]))
  expect(useAuthStore.getState().userInfo?.buttons).not.toContain("task:read")
  fail = true
  await act(async () => {
    await hook.result.current.query.refetch()
  })
  await waitFor(() => expect(hook.result.current.query.isError).toBe(true))
  expect(hook.result.current.tasks).toEqual([])
})
test("edit initialization has its own identity and never reveals another schedule's arguments", async () => {
  const { wrapper } = setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/:id`, async ({ params }) => {
      if (params.id === "two") await gate
      return reply({ ...body, id: params.id, args: [params.id] })
    }),
  )
  const hook = renderHook(({ id }) => useScheduleDetail(id, "opening"), { wrapper, initialProps: { id: "one" } })
  await waitFor(() => expect(hook.result.current.data?.args).toEqual(["one"]))
  hook.rerender({ id: "two" })
  expect(hook.result.current.data).toBeUndefined()
  await act(async () => release())
  await waitFor(() => expect(hook.result.current.data?.args).toEqual(["two"]))
})
test("toggle/delete share a per-row flight lock, recheck current rows and respect false delete acknowledgements", async () => {
  const { wrapper, client, session } = setup(),
    key = scheduleKeys.list(session, { page: 1, pageSize: 20 })
  client.setQueryData(key, { records: [{ id, ...body }], total: 1, page: 1, pageSize: 20 })
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.patch(`${base}/${id}/toggle`, async () => {
      calls++
      await gate
      return reply({ ...body, id, enabled: false })
    }),
    http.delete(`${base}/${id}`, () => {
      calls++
      return reply(false)
    }),
  )
  const one = renderHook(() => useScheduleOperations(key), { wrapper }),
    two = renderHook(() => useScheduleOperations(key), { wrapper })
  let pending!: Promise<boolean>
  act(() => {
    pending = one.result.current.toggle(id)
  })
  await waitFor(() => expect(calls).toBe(1))
  await act(async () => expect(await two.result.current.remove(id)).toBe(false))
  await act(async () => {
    release()
    expect(await pending).toBe(true)
  })
  await act(async () => expect(await one.result.current.remove(id)).toBe(false))
  expect(calls).toBe(2)
  client.setQueryData(key, { records: [], total: 0, page: 1, pageSize: 20 })
  await act(async () => expect(await one.result.current.toggle(id)).toBe(false))
  expect(calls).toBe(2)
})
test("saving requires fresh registered choices and successful edit details; revoked/old sessions cannot write or report success", async () => {
  const { wrapper, client, session } = setup(false),
    registered = scheduleKeys.registered(session, "opening"),
    detail = scheduleKeys.detail(session, id, "opening")
  client.setQueryData(registered, { tasks: [body.task] })
  let calls = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(base, async () => {
      calls++
      await gate
      return reply({ ...body, id })
    }),
    http.put(`${base}/${id}`, () => {
      calls++
      return reply({ ...body, id })
    }),
  )
  const hook = renderHook(() => useScheduleOperations(), { wrapper })
  await act(async () =>
    expect(await hook.result.current.save({ id, body, registeredKey: registered, detailKey: detail })).toBe(false),
  )
  expect(calls).toBe(0)
  client.setQueryData(detail, { ...body, id })
  await act(async () =>
    expect(await hook.result.current.save({ id, body, registeredKey: registered, detailKey: detail })).toBe(true),
  )
  expect(calls).toBe(1)
  let pending!: Promise<boolean>
  act(() => {
    pending = hook.result.current.save({ body, registeredKey: registered })
  })
  await waitFor(() => expect(calls).toBe(2))
  const retained = hook.result.current.save
  hook.unmount()
  useAuthStore.getState().setToken("other", "other-schedule-session")
  await act(async () => {
    release()
    expect(await pending).toBe(false)
    expect(await retained({ body, registeredKey: registered })).toBe(false)
  })
  expect(calls).toBe(2)
})

test("new-drawer saves with an explicit undefined identity remain single-flight across mounted callers", async () => {
  const { wrapper, client, session } = setup(),
    registeredKey = scheduleKeys.registered(session, "opening")
  client.setQueryData(registeredKey, { tasks: [body.task] })
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(base, async () => {
      calls++
      await gate
      return reply({ ...body, id })
    }),
  )
  const one = renderHook(() => useScheduleOperations(), { wrapper }),
    two = renderHook(() => useScheduleOperations(), { wrapper })
  let pending!: Promise<boolean>
  act(() => {
    pending = one.result.current.save({ id: undefined, body, registeredKey })
  })
  await waitFor(() => expect(calls).toBe(1))
  let duplicate!: Promise<boolean>
  act(() => {
    duplicate = two.result.current.save({ id: undefined, body, registeredKey })
  })
  await act(async () => {
    release()
    expect(await pending).toBe(true)
    expect(await duplicate).toBe(false)
  })
  expect(calls).toBe(1)
})
