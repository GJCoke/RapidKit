// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  batchDeleteUsers,
  changeUserPassword,
  validateUsernamePinyin,
  resendUserInvite,
  fetchAllUsers,
  fetchUserDepartmentCounts,
} from "@/services/api/user"
const base = "http://localhost:16000/api/v1"
test("user requests preserve directory filters and exact CRUD, invite, pinyin and encrypted password bodies", async () => {
  const calls: unknown[] = []
  server.use(
    http.all(`${base}/users*`, async ({ request }) => {
      const url = new URL(request.url)
      calls.push([
        request.method,
        url.pathname,
        Object.fromEntries(url.searchParams),
        request.method === "GET" ? null : await request.text(),
      ])
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  const body = {
    name: "Parity User",
    username: "parity_user",
    email: "parity@example.test",
    status: "1" as const,
    roles: ["reader"],
    isAdmin: false,
    departmentId: null,
  }
  const password = { oldPassword: "encrypted-old", newPassword: "encrypted-new" }
  await fetchUsers({
    page: 2,
    pageSize: 20,
    keyword: "Parity",
    status: "3",
    departmentId: "d1",
    includeChildren: false,
    unassigned: false,
  })
  await createUser(body)
  await updateUser("u1", { name: "Updated", remark: null })
  await deleteUser("u1")
  await batchDeleteUsers({ ids: ["u2", "u3"] })
  await changeUserPassword("u1", password)
  await validateUsernamePinyin({ name: "Parity User", username: "parity_user" })
  await resendUserInvite("u1")
  await fetchAllUsers()
  expect(calls).toEqual([
    [
      "GET",
      "/api/v1/users",
      {
        page: "2",
        pageSize: "20",
        keyword: "Parity",
        status: "3",
        departmentId: "d1",
        includeChildren: "false",
        unassigned: "false",
      },
      null,
    ],
    ["POST", "/api/v1/users", {}, JSON.stringify(body)],
    ["PUT", "/api/v1/users/u1", {}, JSON.stringify({ name: "Updated", remark: null })],
    ["DELETE", "/api/v1/users/u1", {}, ""],
    ["DELETE", "/api/v1/users", {}, JSON.stringify({ ids: ["u2", "u3"] })],
    ["PUT", "/api/v1/users/u1/password", {}, JSON.stringify(password)],
    [
      "POST",
      "/api/v1/users/validate-username-pinyin",
      {},
      JSON.stringify({ name: "Parity User", username: "parity_user" }),
    ],
    ["POST", "/api/v1/users/u1/resend-invite", {}, ""],
    ["GET", "/api/v1/users/all", {}, null],
  ])
})
test("department counts retain total, unassigned and department-specific scoped counts", async () => {
  const data = { total: 8, unassigned: 3, departments: { d1: 2, d2: 3 } }
  server.use(http.get(`${base}/users/department-counts`, () => HttpResponse.json({ code: 0, data })))
  expect((await fetchUserDepartmentCounts()).data).toEqual(data)
})
