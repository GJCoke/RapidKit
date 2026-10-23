// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { fetchPluginList, fetchPluginDependencies, fetchPluginEvents } from "@/services/api/plugin-monitoring"
test("plugin monitoring uses three exact GET contracts without invented parameters", async () => {
  const calls: string[] = []
  server.use(
    http.get("http://localhost:16000/api/v1/system/*", ({ request }) => {
      calls.push(request.method + " " + new URL(request.url).pathname + new URL(request.url).search)
      return HttpResponse.json({ code: 0, data: [] })
    }),
  )
  await fetchPluginList()
  await fetchPluginDependencies()
  await fetchPluginEvents()
  expect(calls).toEqual([
    "GET /api/v1/system/plugins",
    "GET /api/v1/system/plugins/dependencies",
    "GET /api/v1/system/events",
  ])
})
