// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  batchDeleteRoles,
  createRole,
  deleteRole,
  fetchPermissionCatalog,
  fetchPermissionMenus,
  fetchPermissionPackages,
  fetchRolePermissions,
  fetchRoles,
  updateRole,
  updateRolePermissions,
} from "@/services/api/role"

const base = "http://localhost:16000/api/v1"
test("role CRUD uses OpenAPI routes, query names and exact bodies", async () => {
  const calls: unknown[] = []
  server.use(
    http.all(`${base}/roles*`, async ({ request }) => {
      const url = new URL(request.url)
      calls.push([
        request.method,
        url.pathname,
        url.searchParams.get("keyword"),
        request.method === "GET" ? null : await request.text(),
      ])
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  const body = { name: "Reader", code: "reader", description: "", status: "1" as const }
  await fetchRoles({ keyword: "read", page: 2, pageSize: 10 })
  await createRole({ ...body, permissionCodes: [] })
  await updateRole("r1", body)
  await deleteRole("r1")
  await batchDeleteRoles({ ids: ["r2", "r3"] })
  expect(calls).toEqual([
    ["GET", "/api/v1/roles", "read", null],
    ["POST", "/api/v1/roles", null, JSON.stringify({ ...body, permissionCodes: [] })],
    ["PUT", "/api/v1/roles/r1", null, JSON.stringify(body)],
    ["DELETE", "/api/v1/roles/r1", null, ""],
    ["DELETE", "/api/v1/roles", null, JSON.stringify({ ids: ["r2", "r3"] })],
  ])
})
test("permission requests preserve explicit scope and field maps, including clearing", async () => {
  const payload = { permissionCodes: ["user:read"], dataScopes: {}, fieldModes: {} }
  let saved: unknown
  server.use(
    http.get(`${base}/roles/r1/permissions`, () =>
      HttpResponse.json({ code: 0, data: { ...payload, invalidCodes: [], invalidScopes: [] } }),
    ),
    http.put(`${base}/roles/r1/permissions`, async ({ request }) => {
      saved = await request.json()
      return HttpResponse.json({ code: 0, data: true })
    }),
    ...["permission-catalog", "permission-packages/all", "manage/menus"].map((path) =>
      http.get(`${base}/${path}`, () => HttpResponse.json({ code: 0, data: { path } })),
    ),
  )
  expect((await fetchRolePermissions("r1")).data).toMatchObject(payload)
  await updateRolePermissions("r1", payload)
  expect(saved).toEqual(payload)
  for (const [call, path] of [
    [fetchPermissionCatalog, "permission-catalog"],
    [fetchPermissionPackages, "permission-packages/all"],
    [fetchPermissionMenus, "manage/menus"],
  ] as const) {
    expect((await call()).data).toEqual({ path })
  }
})
