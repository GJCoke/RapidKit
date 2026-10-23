import assert from "node:assert/strict"
export const pluginPattern = /\/(?:api\/v1|proxy-default)\/system\/(?:plugins(?:\/dependencies)?|events)(?:\?|$)/
export function pluginFixtures() {
  const plugins = [
    {
      name: "System",
      version: "1.2.3",
      status: "loaded",
      required: true,
      dependencies: ["Core"],
      loadTimeMs: 12.35,
      startupTimeMs: 5.1,
    },
    {
      name: "Core",
      version: "2.0.0",
      status: "loaded",
      required: false,
      dependencies: [],
      loadTimeMs: 1.2,
      startupTimeMs: 0,
    },
    {
      name: "Disabled",
      version: null,
      status: "disabled",
      required: null,
      dependencies: null,
      loadTimeMs: null,
      startupTimeMs: null,
    },
    {
      name: "Broken",
      version: "0.0.1",
      status: "failed",
      error: { phase: "startup", message: "connection refused", causedBy: "database unavailable" },
    },
    { name: "Degraded", version: "3.1.0", status: "degraded" },
  ]
  const graph = {
    nodes: plugins.map((p) => ({
      name: p.name,
      version: p.version ?? null,
      status: p.status,
      required: p.required ?? true,
    })),
    edges: [
      { source: "System", target: "Core" },
      { source: "Broken", target: "Core" },
      { source: "Degraded", target: "System" },
    ],
  }
  const events = {
    handlerErrors: { "user.created": 2, "notification.failed": 9 },
    deadLetterCount: 23,
    deadLetters: [
      { eventName: "delivery.failed", timestamp: "2026-11-01T01:30:00-04:00", source: "Mailer" },
      { eventName: "delivery.failed-again", timestamp: "2026-11-01T01:30:00-05:00", source: null },
    ],
  }
  const state = { plugins, graph, events, calls: [], empty: false, fail: new Set(), gates: new Map() }
  async function handler(route) {
    assert.equal(route.request().method(), "GET")
    const path = new URL(route.request().url()).pathname,
      kind = path.endsWith("/dependencies") ? "graph" : path.endsWith("/events") ? "events" : "plugins"
    state.calls.push(kind)
    if (state.gates.has(kind)) await state.gates.get(kind)
    return route.fulfill({
      json: state.fail.has(kind)
        ? { code: 422, message: "Plugin monitoring fixture failure", data: null }
        : {
            code: 0,
            data: state.empty
              ? {
                  plugins: [],
                  graph: { nodes: [], edges: [] },
                  events: { handlerErrors: {}, deadLetters: [], deadLetterCount: 0 },
                }[kind]
              : state[kind],
          },
    })
  }
  return { state, handler }
}
