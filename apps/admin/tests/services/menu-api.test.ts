// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchMenus,
  createMenu,
  updateMenu,
  deleteMenu,
  batchDeleteMenus,
  fetchMenuPages,
  fetchActiveMenuOptions,
} from "@/services/api/menu"
const base = "http://localhost:16000/api/v1"
test("menu requests use exact CRUD bodies and parent/constant partition query names", async () => {
  const calls: unknown[] = []
  server.use(
    http.all(`${base}/manage/*`, async ({ request }) => {
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
    menuName: "Test",
    routeName: "test",
    routePath: "/test",
    menuType: "1" as const,
    order: 0,
    iconType: "1" as const,
    status: "1" as const,
    hideInMenu: false,
    keepAlive: false,
    constant: false,
    multiTab: false,
    query: [],
  }
  await fetchMenus({ page: 2, pageSize: 20 })
  await createMenu(body)
  await updateMenu("m1", body)
  await deleteMenu("m1")
  await batchDeleteMenus(["m2", "m3"])
  await fetchMenuPages()
  await fetchActiveMenuOptions("parent", true)
  expect(calls).toEqual([
    ["GET", "/api/v1/manage/menus", { page: "2", pageSize: "20" }, null],
    ["POST", "/api/v1/manage/menus", {}, JSON.stringify(body)],
    ["PUT", "/api/v1/manage/menus/m1", {}, JSON.stringify(body)],
    ["DELETE", "/api/v1/manage/menus/m1", {}, ""],
    ["DELETE", "/api/v1/manage/menus", {}, JSON.stringify({ ids: ["m2", "m3"] })],
    ["GET", "/api/v1/manage/pages", {}, null],
    ["GET", "/api/v1/manage/menus/active-menu-options", { parentId: "parent", constant: "true" }, null],
  ])
})
