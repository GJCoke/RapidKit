// @vitest-environment jsdom
import { type ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { readTaskView } from "@/views/queue/task/modules/task-view-state"
import {
  taskKeys,
  useTaskRecords,
  useTaskOperations,
  useTaskRegistration,
  useTaskDetail,
} from "@/services/hooks/use-tasks"
const base = "http://localhost:16000/api/v1/tasks",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function setup() {
  useAuthStore.getState().setToken("access", "task-session")
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
    session = getAuthSession(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  return { client, session, wrapper }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("records query exact task/worker/status/time and never expose previous rows while changing page", async () => {
  const { wrapper } = setup(),
    state = readTaskView(new URLSearchParams("task=job&worker=host&status=4"))
  let gate!: () => void
  const held = new Promise<void>((resolve) => {
    gate = resolve
  })
  let requested = ""
  server.use(
    http.get(base, async ({ request }) => {
      const query = new URL(request.url).searchParams
      requested = request.url
      if (query.get("page") === "2") await held
      return reply({
        records: [{ taskId: `row-${query.get("page")}`, status: "1" }],
        total: 30,
        page: Number(query.get("page")),
        pageSize: 20,
      })
    }),
  )
  const hook = renderHook(({ page }) => useTaskRecords(state, { page, pageSize: 20 }), {
    wrapper,
    initialProps: { page: 1 },
  })
  await waitFor(() => expect(hook.result.current.data?.records[0].taskId).toBe("row-1"))
  expect(requested).toContain("taskNameMatch=exact")
  expect(requested).toContain("workerHostname=host")
  expect(requested).toContain("status=4")
  hook.rerender({ page: 2 })
  expect(hook.result.current.data).toBeUndefined()
  await act(async () => gate())
  await waitFor(() => expect(hook.result.current.data?.records[0].taskId).toBe("row-2"))
})
test("revoke rechecks the current row, permissions and false acknowledgements, with cross-hook single flight", async () => {
  const { wrapper, client, session } = setup(),
    key = taskKeys.records(session, { page: 1, pageSize: 20 })
  client.setQueryData(key, { records: [{ taskId: "one", status: "1" }], total: 1, page: 1, pageSize: 20 })
  let calls = 0,
    accepted = false,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(`${base}/one/revoke`, async () => {
      calls++
      if (calls === 1) await gate
      return reply(accepted)
    }),
  )
  const one = renderHook(() => useTaskOperations(key), { wrapper }),
    two = renderHook(() => useTaskOperations(key), { wrapper })
  let pending!: Promise<boolean>
  act(() => {
    pending = one.result.current.revoke("one")
  })
  await waitFor(() => expect(calls).toBe(1))
  await act(async () => expect(await two.result.current.revoke("one")).toBe(false))
  await act(async () => {
    release()
    expect(await pending).toBe(false)
  })
  accepted = true
  client.setQueryData(key, { records: [{ taskId: "one", status: "3" }], total: 1, page: 1, pageSize: 20 })
  await act(async () => expect(await one.result.current.revoke("one")).toBe(false))
  client.setQueryData(key, { records: [{ taskId: "one", status: "2" }], total: 1, page: 1, pageSize: 20 })
  await act(async () => expect(await one.result.current.revoke("one")).toBe(true))
  expect(calls).toBe(2)
  useAuthStore.setState((state) => ({
    userInfo: state.userInfo ? { ...state.userInfo, isAdmin: false, buttons: ["task:read"] } : null,
  }))
  await act(async () => expect(await one.result.current.revoke("one")).toBe(false))
  expect(calls).toBe(2)
})
test("trigger accepts only a freshly registered name and preserves failure as failure", async () => {
  const { wrapper, client, session } = setup(),
    registered = taskKeys.registered(session, "opening")
  client.setQueryData(registered, { tasks: ["job"] })
  let calls = 0
  server.use(
    http.post(`${base}/trigger`, async ({ request }) => {
      calls++
      expect(await request.json()).toEqual({ taskName: "job", args: [null], kwargs: { flag: true } })
      return reply({ taskId: "submitted" })
    }),
  )
  const hook = renderHook(() => useTaskOperations(), { wrapper })
  await act(async () =>
    expect(await hook.result.current.trigger({ taskName: "unregistered", args: [], kwargs: {} }, registered)).toBe(
      false,
    ),
  )
  await act(async () =>
    expect(
      await hook.result.current.trigger({ taskName: "job", args: [null], kwargs: { flag: true } }, registered),
    ).toBe(true),
  )
  expect(calls).toBe(1)
  client.setQueryData(registered, { tasks: [] })
  await act(async () =>
    expect(await hook.result.current.trigger({ taskName: "job", args: [], kwargs: {} }, registered)).toBe(false),
  )
  expect(calls).toBe(1)
})
test("failed registration refresh locks cached choices and detail never reveals another task's data", async () => {
  const { wrapper } = setup()
  let fail = false
  server.use(
    http.get(`${base}/registered`, () =>
      fail ? HttpResponse.json({ code: 500, msg: "failed" }) : reply({ tasks: ["job"] }),
    ),
    http.get(`${base}/:id`, ({ params }) => reply({ taskId: params.id, name: params.id })),
  )
  const registration = renderHook(() => useTaskRegistration("opening"), { wrapper })
  await waitFor(() => expect(registration.result.current.tasks).toEqual(["job"]))
  fail = true
  await act(async () => {
    await registration.result.current.query.refetch()
  })
  await waitFor(() => expect(registration.result.current.query.isError).toBe(true))
  expect(registration.result.current.tasks).toEqual([])
  const detail = renderHook(({ id }) => useTaskDetail(id), { wrapper, initialProps: { id: "one" } })
  await waitFor(() => expect(detail.result.current.data?.taskId).toBe("one"))
  detail.rerender({ id: "two" })
  expect(detail.result.current.data).toBeUndefined()
  await waitFor(() => expect(detail.result.current.data?.taskId).toBe("two"))
})
test("old account responses and retained unmounted actions cannot mutate or report success", async () => {
  const { wrapper, client, session } = setup(),
    registered = taskKeys.registered(session, "opening")
  client.setQueryData(registered, { tasks: ["job"] })
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(`${base}/trigger`, async () => {
      calls++
      await gate
      return reply({ taskId: "late" })
    }),
  )
  const hook = renderHook(() => useTaskOperations(), { wrapper })
  let pending!: Promise<boolean>
  act(() => {
    pending = hook.result.current.trigger({ taskName: "job", args: [], kwargs: {} }, registered)
  })
  await waitFor(() => expect(calls).toBe(1))
  const retained = hook.result.current.trigger
  hook.unmount()
  useAuthStore.getState().setToken("other", "other-session")
  await act(async () => {
    release()
    expect(await pending).toBe(false)
    expect(await retained({ taskName: "job", args: [], kwargs: {} }, registered)).toBe(false)
  })
  expect(calls).toBe(1)
})
