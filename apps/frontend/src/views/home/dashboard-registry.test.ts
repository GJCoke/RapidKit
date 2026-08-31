import assert from "node:assert/strict"
import test from "node:test"
import { selectDashboardModules } from "./dashboard-registry"

test("selects allowed modules in presentation order", () => {
  const active = selectDashboardModules(
    [
      { key: "dashboard.trends", order: 20 },
      { key: "dashboard.business", order: 10 },
    ],
    ["dashboard.trends", "dashboard.business"],
  )

  assert.deepEqual(
    active.map(item => item.key),
    ["dashboard.business", "dashboard.trends"],
  )
})

test("ignores backend keys absent from the presentation registry", () => {
  const active = selectDashboardModules(
    [{ key: "dashboard.business", order: 20 }],
    ["dashboard.business", "plugin.removed"],
  )

  assert.deepEqual(active.map(item => item.key), ["dashboard.business"])
})

test("rejects duplicate presentation keys", () => {
  assert.throws(
    () =>
      selectDashboardModules(
        [
          { key: "dashboard.business", order: 10 },
          { key: "dashboard.business", order: 20 },
        ],
        ["dashboard.business"],
      ),
    /duplicate/,
  )
})
