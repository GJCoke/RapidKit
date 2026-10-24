// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { fetchDepartmentTree, createDepartment, updateDepartment, deleteDepartment } from "@/services/api/department"
const base = "http://localhost:16000/api/v1"
test("department CRUD sends hierarchy and leader fields and retains the deleted department response", async () => {
  const calls: unknown[] = [],
    removed = { id: "d1", name: "Removed" }
  server.use(
    http.all(`${base}/departments*`, async ({ request }) => {
      calls.push([
        request.method,
        new URL(request.url).pathname,
        request.method === "GET" ? null : await request.text(),
      ])
      return HttpResponse.json({ code: 0, data: request.method === "DELETE" ? removed : [] })
    }),
  )
  const body = { parentId: "root", name: "Child", code: "child", sort: 3, status: "2" as const, leaderId: "u1" }
  await fetchDepartmentTree()
  await createDepartment(body)
  await updateDepartment("d1", { parentId: null, leaderId: null, status: "3" })
  expect((await deleteDepartment("d1")).data).toEqual(removed)
  expect(calls).toEqual([
    ["GET", "/api/v1/departments/tree", null],
    ["POST", "/api/v1/departments", JSON.stringify(body)],
    ["PUT", "/api/v1/departments/d1", JSON.stringify({ parentId: null, leaderId: null, status: "3" })],
    ["DELETE", "/api/v1/departments/d1", ""],
  ])
})
