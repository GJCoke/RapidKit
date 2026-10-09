// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, watch } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import Page from "../../src/views/queue/task/index.vue"
const queries = vi.hoisted(() => [] as Record<string, unknown>[])
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => false }) }))
vi.mock("@/hooks/common/socket", () => ({ useSocket: () => ({ socket: { value: null }, connect: vi.fn() }) }))
vi.mock("../../src/views/queue/task/modules/task-drawer.vue", () => ({
  default: defineComponent({ render: () => null }),
}))
vi.mock("../../src/views/queue/task/modules/trigger-modal.vue", () => ({
  default: defineComponent({ render: () => null }),
}))
vi.mock("../../src/views/queue/task/modules/task-stream.vue", () => ({
  default: defineComponent({
    props: ["filters"],
    setup(props) {
      watch(
        () => props.filters,
        (filters) => queries.push({ ...filters }),
        { deep: true, immediate: true },
      )
      return () => null
    },
  }),
}))
vi.mock("../../src/views/queue/task/modules/task-groups.vue", () => ({
  default: defineComponent({
    props: ["query"],
    setup(props) {
      watch(
        () => props.query,
        (query) => queries.push({ ...query }),
        { deep: true, immediate: true },
      )
      return () => h("div")
    },
  }),
}))
let unmount = () => {}
const originalScrollTo = HTMLElement.prototype.scrollTo
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
  HTMLElement.prototype.scrollTo = originalScrollTo
  document.body.innerHTML = ""
  queries.length = 0
})
it("clears the exact task drilldown and committed filters when Reset is clicked", async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Page }] })
  await router.push("/?view=records&task=tasks.sync&status=4&worker=worker2&keyword=sync")
  await router.isReady()
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(Page)
  app.use(router)
  app.mount(root)
  unmount = () => app.unmount()
  await flush()
  expect(queries.at(-1)).toMatchObject({ taskName: "tasks.sync", taskNameMatch: "exact", status: "4" })
  const statusSelect = root.querySelectorAll(".n-select")[1]!
  expect(statusSelect.querySelector(".n-base-selection-placeholder")).toBeNull()
  statusSelect.querySelector<HTMLElement>(".n-base-selection")!.click()
  await flush()
  statusSelect
    .querySelector<HTMLElement>(".n-base-selection")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  await flush()
  statusSelect
    .querySelector<HTMLElement>(".n-base-selection")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  await flush()
  const reset = Array.from(root.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "common.reset",
  )!
  reset.click()
  await flush()
  expect(statusSelect.querySelector(".n-base-selection-placeholder")?.textContent).toBe(
    "page.manage.worker.form.status",
  )
  expect(queries.at(-1)).toMatchObject({
    taskName: undefined,
    taskNameMatch: "contains",
    status: undefined,
    workerHostname: undefined,
  })
  expect(root.querySelector<HTMLInputElement>('input[placeholder="page.manage.worker.form.taskName"]')!.disabled).toBe(
    false,
  )
  await vi.waitFor(() => expect(router.currentRoute.value.query.task).toBeUndefined())
})
const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
it("queries only on Search while typing and immediately restores the list on Reset", async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Page }] })
  await router.push("/?view=groups")
  await router.isReady()
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(Page)
  app.use(router)
  app.mount(root)
  unmount = () => app.unmount()
  await flush()
  const initial = queries.length
  const input = root.querySelector<HTMLInputElement>('input[placeholder="page.manage.worker.form.taskName"]')!
  input.value = "tasks.sync"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await flush()
  expect(queries).toHaveLength(initial)
  expect(router.currentRoute.value.query.keyword).toBeUndefined()
  const button = (name: string) =>
    Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim() === name)!
  button("common.search").click()
  await flush()
  expect(queries.at(-1)?.taskName).toBe("tasks.sync")
  await vi.waitFor(() => expect(router.currentRoute.value.query.keyword).toBe("tasks.sync"))
  const applied = queries.length
  button("common.reset").click()
  await flush()
  expect(input.value).toBe("")
  expect(queries.length).toBeGreaterThan(applied)
  expect(queries.at(-1)?.taskName).toBeUndefined()
  expect(queries.at(-1)?.page).toBe(1)
  await vi.waitFor(() => expect(router.currentRoute.value.query.keyword).toBeUndefined())
})
