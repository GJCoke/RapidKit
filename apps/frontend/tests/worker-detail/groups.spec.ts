import { createSSRApp } from "vue"
import { renderToString } from "vue/server-renderer"
import { expect, it, vi } from "vitest"
import WorkerCards from "../../src/views/queue/dashboard/modules/worker-cards.vue"

vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => true }) }))
vi.mock("@/locales", () => ({ $t: (key: string, params?: object) => `${key} ${JSON.stringify(params ?? {})}` }))

it("renders missing groups even when no instance has ever registered", async () => {
  const html = await renderToString(
    createSSRApp(WorkerCards, {
      groups: [
        { name: "prod/report", online: 0, expectedReplicas: 2, observed: 0, draining: 0, missing: 2, alerting: true },
      ],
      workers: [],
      history: false,
      loading: false,
    }),
  )
  expect(html).toContain("prod/report")
  expect(html).toContain("groups.missing")
  expect(html).toContain("expected&quot;:2")
})

it("shows unknown capacity rather than deriving it from discovered instances", async () => {
  const html = await renderToString(
    createSSRApp(WorkerCards, {
      groups: [
        {
          name: "local/default",
          online: 1,
          expectedReplicas: null,
          observed: 4,
          draining: 0,
          missing: 0,
          alerting: false,
        },
      ],
      workers: [],
      history: false,
      loading: false,
    }),
  )
  expect(html).toContain("groups.unknown")
  expect(html).not.toContain("expected&quot;:4")
})
