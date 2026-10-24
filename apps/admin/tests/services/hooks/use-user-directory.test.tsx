// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useUsers } from "@/services/hooks/use-users"
import {
  useRoleOptions,
  useDepartmentOptions,
  useDirectoryUserOptions,
  useUserDepartmentCounts,
} from "@/services/hooks/use-user-options"
function setup(buttons = ["user:read", "role:options", "department:read", "user:options"]) {
  useAuthStore.getState().setToken("access", "directory-read-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: false,
      roles: [],
      buttons,
      createTime: "",
      updateTime: "",
    },
  })
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
})
const base = "http://localhost:16000/api/v1"
test("a pending page never exposes previous-page users as selectable rows", async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/users`, async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"))
      if (page === 2) await pending
      return HttpResponse.json({
        code: 0,
        data: { page, pageSize: 20, total: 40, records: [{ id: page === 1 ? "first" : "second", name: "User" }] },
      })
    }),
  )
  const context = setup(),
    hook = renderHook(() => useUsers({ keyword: "user", departmentId: "d1", includeChildren: false }), context)
  await waitFor(() => expect(hook.result.current.tableData.records[0]?.id).toBe("first"))
  act(() => hook.result.current.setPage(2))
  await waitFor(() => expect(hook.result.current.query.isPlaceholderData).toBe(true))
  try {
    expect(hook.result.current.tableData.records).toEqual([])
    expect(hook.result.current.tableData.total).toBe(40)
  } finally {
    release()
  }
  await waitFor(() => expect(hook.result.current.tableData.records[0]?.id).toBe("second"))
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(hook.result.current.tableData.records).toEqual([])
})
test("directory options and counts are session scoped and each read is permission gated", async () => {
  const calls: string[] = []
  server.use(
    http.get(`${base}/*`, ({ request }) => {
      const pathname = new URL(request.url).pathname
      calls.push(pathname)
      return HttpResponse.json({
        code: 0,
        data: pathname.endsWith("department-counts") ? { total: 5, unassigned: 2, departments: {} } : [],
      })
    }),
  )
  const context = setup(),
    hook = renderHook(
      () => ({
        roles: useRoleOptions(),
        departments: useDepartmentOptions(),
        users: useDirectoryUserOptions(),
        counts: useUserDepartmentCounts(),
      }),
      context,
    )
  await waitFor(() => expect(hook.result.current.counts.isSuccess).toBe(true))
  await waitFor(() => expect(calls).toHaveLength(4))
  expect(context.client.getQueriesData({ queryKey: ["users", getAuthSession()] })).toHaveLength(4)
  expect(calls.sort()).toEqual([
    "/api/v1/departments/tree",
    "/api/v1/roles/all",
    "/api/v1/users/all",
    "/api/v1/users/department-counts",
  ])
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(hook.result.current.roles.data).toBeUndefined()
  expect(hook.result.current.departments.data).toBeUndefined()
  expect(hook.result.current.users.data).toBeUndefined()
  expect(hook.result.current.counts.data).toBeUndefined()
})
test("opening a directory without read permissions performs no API requests", async () => {
  let calls = 0
  server.use(
    http.get(`${base}/*`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: [] })
    }),
  )
  const context = setup([]),
    hook = renderHook(
      () => ({
        list: useUsers({}),
        roles: useRoleOptions(),
        departments: useDepartmentOptions(),
        users: useDirectoryUserOptions(),
        counts: useUserDepartmentCounts(),
      }),
      context,
    )
  await waitFor(() => expect(hook.result.current.list.query.isError).toBe(true))
  expect(calls).toBe(0)
  expect(hook.result.current.list.tableData.records).toEqual([])
})

test("a changed field policy starts a fresh list snapshot and never exposes clear rows while masked results are pending", async () => {
  let masked = false,
    release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/users`, async () => {
      if (masked) await pending
      return HttpResponse.json({
        code: 0,
        data: {
          page: 1,
          pageSize: 20,
          total: 1,
          records: [{ id: "user", name: "User", email: masked ? "s***@example.test" : "secret@example.test" }],
        },
      })
    }),
  )
  const context = setup(),
    hook = renderHook(() => useUsers({}), context)
  await waitFor(() => expect(hook.result.current.tableData.records[0]?.email).toBe("secret@example.test"))
  masked = true
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, restrictedFields: { user: { email: "masked" } } },
    }),
  )
  try {
    await waitFor(() => expect(hook.result.current.tableData.records).toEqual([]))
  } finally {
    release()
  }
  await waitFor(() => expect(hook.result.current.tableData.records[0]?.email).toBe("s***@example.test"))
})
