// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, watch } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"
import { NConfigProvider } from "naive-ui"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { setPlatformTimezone } from "@/utils/datetime"
import Page from "../../src/views/queue/task/index.vue"
import SchedulePage from "../../src/views/queue/schedule/index.vue"
const queries = vi.hoisted(() => [] as Record<string, unknown>[])
const taskSocket = vi.hoisted(() => ({ handlers: new Map<string, () => void>(), refresh: vi.fn() }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => {
    const hasAuth = () => false
    return {
      hasAuth,
      getActionContext: (locale = "zh-CN") => ({
        ready: true,
        hasAuth,
        actorId: "actor",
        isAdmin: false,
        impersonating: false,
        locale,
      }),
    }
  },
}))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ isMobile: false, locale: "zh-CN" }) }))
vi.mock("@/service/api/worker", () => ({
  fetchGetScheduleList: vi.fn().mockResolvedValue({
    data: {
      records: [
        {
          id: "schedule-id",
          createTime: "2026-10-13T00:00:00Z",
          updateTime: "2026-10-13T00:00:00Z",
          name: "Nightly sync",
          task: "plugin.tasks.sync",
          schedule: { type: "interval", every: 15, period: "minutes" },
          enabled: true,
          description: "",
          args: [],
          kwargs: {},
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    },
    error: null,
  }),
  fetchDeleteSchedule: vi.fn(),
  fetchToggleSchedule: vi.fn(),
}))
vi.mock("../../src/views/queue/schedule/modules/schedule-operate-drawer.vue", () => ({
  default: defineComponent({ render: () => null }),
}))
vi.mock("@/hooks/common/app-socket", () => ({
  useAppSocket: () => ({
    on: (event: string, handler: () => void) => taskSocket.handlers.set(event, handler),
    connect: vi.fn(),
  }),
}))
vi.mock("../../src/views/queue/task/modules/task-drawer.vue", () => ({
  default: defineComponent({ render: () => null }),
}))
vi.mock("../../src/views/queue/task/modules/trigger-modal.vue", () => ({
  default: defineComponent({ render: () => null }),
}))
vi.mock("../../src/views/queue/task/modules/task-stream.vue", () => ({
  default: defineComponent({
    props: ["filters"],
    setup(props, { emit, expose }) {
      expose({ refresh: taskSocket.refresh })
      watch(
        () => props.filters,
        (filters) => queries.push({ ...filters }),
        { deep: true, immediate: true },
      )
      return () => h("button", { onClick: () => emit("refresh") }, "refresh-records")
    },
  }),
}))
vi.mock("../../src/views/queue/task/modules/task-groups.vue", () => ({
  default: defineComponent({
    props: ["query"],
    setup(props, { emit, expose }) {
      expose({ refresh: taskSocket.refresh })
      watch(
        () => props.query,
        (query) => queries.push({ ...query }),
        { deep: true, immediate: true },
      )
      return () => h("button", { onClick: () => emit("refresh") }, "refresh-groups")
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
  setPlatformTimezone("UTC")
  unmount()
  vi.unstubAllGlobals()
  HTMLElement.prototype.scrollTo = originalScrollTo
  document.body.innerHTML = ""
  queries.length = 0
  taskSocket.handlers.clear()
  taskSocket.refresh.mockClear()
  vi.useRealTimers()
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
it.each(["Nightly sync", "plugin.tasks.sync"])(
  "opens exact task records by clicking %s in schedules",
  async (label) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/queue/schedule", component: SchedulePage },
        { path: "/queue/task", component: Page },
      ],
    })
    await router.push("/queue/schedule")
    await router.isReady()
    const root = document.createElement("div")
    document.body.append(root)
    const app = createApp({ render: () => h(NConfigProvider, null, { default: () => h(RouterView) }) })
    app.use(router)
    app.mount(root)
    unmount = () => app.unmount()
    await flush()
    await vi.waitFor(() => expect(root.textContent).toContain("plugin.tasks.sync"))
    const task = Array.from(root.querySelectorAll("button")).find((button) => button.textContent?.trim() === label)
    expect(task).toBeDefined()
    task!.click()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/queue/task"))
    await flush()
    expect(router.currentRoute.value.query).toMatchObject({ view: "records", task: "plugin.tasks.sync", range: "7d" })
    expect(queries.at(-1)).toMatchObject({ taskName: "plugin.tasks.sync", taskNameMatch: "exact", status: undefined })
    expect(root.querySelector(".n-tag")?.textContent).toContain("plugin.tasks.sync")
  },
)
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

it.each(["records", "groups"])("keeps %s stable during background task events until manual refresh", async (view) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-23T01:00:00Z"))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Page }] })
  await router.push({
    path: "/",
    query: {
      view,
      groupPage: "3",
      groupSize: "20",
      range: "7d",
      sortBy: "lastExecutedAt",
      sortOrder: "desc",
      startTime: "2026-10-16T01:00:00.000Z",
      endTime: "2026-10-23T01:00:00.000Z",
    },
  })
  await router.isReady()
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(Page)
  app.use(router)
  app.mount(root)
  unmount = () => app.unmount()
  await flush()
  const initialQuery = { ...router.currentRoute.value.query }
  const initialRequests = queries.length
  for (let count = 0; count < 3; count++) {
    taskSocket.handlers.get("task:update")?.()
    await vi.advanceTimersByTimeAsync(30000)
    await flush()
  }
  expect(queries).toHaveLength(initialRequests)
  expect(taskSocket.refresh).not.toHaveBeenCalled()
  expect(router.currentRoute.value.query).toEqual(initialQuery)

  const refresh = [...root.querySelectorAll("button")].find((button) => button.textContent === `refresh-${view}`)!
  refresh.click()
  await flush()
  expect(queries.length).toBeGreaterThan(initialRequests)
  expect(queries.at(-1)?.endTime).toBe("2026-10-23T01:01:30.000Z")
  expect(router.currentRoute.value.query.groupPage).toBe("3")
})

it("shows canonical task range instants in platform time", async () => {
  setPlatformTimezone("Asia/Shanghai")
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Page }] })
  await router.push("/?range=custom&startTime=2026-10-30T08:00:00Z&endTime=2026-10-30T09:00:00Z")
  await router.isReady()
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(Page)
  app.use(router)
  app.mount(root)
  unmount = () => app.unmount()
  await flush()
  expect(root.textContent).toContain("2026-10-30 16:00:00 – 2026-10-30 17:00:00")
  const start = root.querySelector<HTMLInputElement>('input[aria-label="page.manage.worker.rangeStart"]')!
  const end = root.querySelector<HTMLInputElement>('input[aria-label="page.manage.worker.rangeEnd"]')!
  expect(start.type).toBe("datetime-local")
  for (const [input, value] of [
    [start, "2026-03-08T02:30:00"],
    [end, "2026-03-08T03:30:00"],
  ] as const) {
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }
  await flush()
  Array.from(root.querySelectorAll("button"))
    .find((button) => button.textContent?.trim() === "common.search")!
    .click()
  await flush()
  expect(queries.at(-1)).toMatchObject({ startTime: "2026-03-07T18:30:00.000Z", endTime: "2026-03-07T19:30:00.000Z" })
})
