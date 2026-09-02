import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"
import { dashboardQueryKeys, invalidateDashboardQueries } from "./dashboard-query-keys"

test("dashboard refresh invalidates capabilities and active module data for only the current account", async () => {
  const client = new QueryClient()
  const currentToken = "current-token"
  const otherToken = "other-token"
  const currentKeys = [
    dashboardQueryKeys.capabilities(currentToken),
    dashboardQueryKeys.userSummary(currentToken),
    dashboardQueryKeys.trends(currentToken, { start: "2026-08-04", end: "2026-09-02", granularity: "day" }),
    dashboardQueryKeys.activities(currentToken, 20),
  ]
  const otherKey = dashboardQueryKeys.capabilities(otherToken)

  for (const key of currentKeys) client.setQueryData(key, { data: {}, error: null })
  client.setQueryData(otherKey, { data: {}, error: null })

  await invalidateDashboardQueries(client, currentToken)

  for (const key of currentKeys) assert.equal(client.getQueryState(key)?.isInvalidated, true)
  assert.equal(client.getQueryState(otherKey)?.isInvalidated, false)
})
