// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import WorkerControls from "../../src/views/queue/dashboard/modules/worker-controls.vue"
import WorkerDrawer from "../../src/views/queue/dashboard/modules/worker-drawer.vue"
const api = vi.hoisted(() => ({
  detail: vi.fn(),
  grow: vi.fn(),
  shrink: vi.fn(),
  ping: vi.fn(),
  add: vi.fn(),
  cancel: vi.fn(),
  push: vi.fn(),
  allowed: true,
}))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => api.allowed }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("vue-router", () => ({ useRouter: () => ({ push: api.push }) }))
vi.mock("@/service/api/worker", () => ({
  fetchGetWorkerDetail: api.detail,
  fetchPoolGrow: api.grow,
  fetchPoolShrink: api.shrink,
  fetchPingWorker: api.ping,
  fetchAddQueue: api.add,
  fetchCancelQueue: api.cancel,
  fetchActiveTasksOfWorker: vi.fn().mockResolvedValue({ data: [], error: null }),
  fetchReservedTasksOfWorker: vi.fn().mockResolvedValue({ data: [], error: null }),
}))
vi.mock("naive-ui", () => {
  const slot = {
    setup:
      (_: any, { slots }: any) =>
      () =>
        h("div", slots.default?.()),
  }
  return Object.fromEntries(
    Object.entries({
      NCard: slot,
      NSpin: slot,
      NScrollbar: slot,
      NDrawer: slot,
      NDrawerContent: slot,
      NAlert: slot,
      NTag: slot,
      NEmpty: slot,
      NTabs: {
        props: ["value"],
        setup:
          (p: any, { slots, emit }: any) =>
          () =>
            h("div", { class: "tabs", "data-selected": p.value }, [
              ...["overview", "tasks", "operations"].map((tab) =>
                h("button", { "data-tab": tab, onClick: () => emit("update:value", tab) }, tab),
              ),
              slots.default?.(),
            ]),
      },
      NTabPane: slot,
      NProgress: slot,
      NCollapse: slot,
      NCollapseItem: slot,
      NDescriptions: slot,
      NDescriptionsItem: slot,
      NButton: {
        props: ["disabled"],
        setup:
          (p: any, { attrs, slots }: any) =>
          () =>
            h("button", { ...attrs, disabled: p.disabled }, slots.default?.()),
      },
      NInputNumber: {
        props: ["value", "disabled"],
        setup:
          (p: any, { emit }: any) =>
          () =>
            h("input", {
              type: "number",
              value: p.value,
              disabled: p.disabled,
              onInput: (e: any) => emit("update:value", e.target.value === "" ? null : Number(e.target.value)),
            }),
      },
      NInput: {
        props: ["value", "disabled"],
        setup:
          (p: any, { emit }: any) =>
          () =>
            h("input", {
              value: p.value,
              disabled: p.disabled,
              onInput: (e: any) => emit("update:value", e.target.value),
            }),
      },
      NPopconfirm: {
        props: ["disabled"],
        setup:
          (p: any, { slots, emit }: any) =>
          () =>
            h("div", [
              slots.trigger?.(),
              h("button", { class: "confirm", disabled: p.disabled, onClick: () => emit("positive-click") }, "confirm"),
            ]),
      },
    }),
  )
})
const worker = () =>
  ({
    id: "worker-id",
    hostname: "celery@exact-host",
    status: "1",
    lastHeartbeat: new Date().toISOString(),
    concurrency: 8,
    activeTaskCount: 2,
    processedCount: 99,
    activeQueues: ["celery"],
    softwareInfo: {},
    loadAverage: {},
  }) as Api.Worker.WorkerInfo
let app: ReturnType<typeof createApp>
let host: HTMLElement
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
function mount(component: any, props: any) {
  host = document.createElement("div")
  app = createApp({ render: () => h(component, props) })
  app.component("SvgIcon", { render: () => h("span") })
  app.mount(host)
}
function button(fragment: string) {
  return Array.from(host.querySelectorAll("button")).find((el) => el.textContent?.includes(fragment))!
}
beforeEach(() => {
  api.allowed = true
  api.detail.mockReset().mockResolvedValue({ data: { activeQueues: ["celery"] }, error: null })
  for (const name of ["grow", "shrink", "ping", "add", "cancel"] as const)
    api[name].mockReset().mockResolvedValue({ data: { success: true }, error: null })
  api.push.mockClear()
})
afterEach(() => app?.unmount())
it("hides operation controls without permission and disables offline commands", async () => {
  api.allowed = false
  mount(WorkerControls, { worker: worker(), online: true, queues: ["celery"] })
  expect(host.querySelector("button")).toBeNull()
  app.unmount()
  api.allowed = true
  mount(WorkerControls, { worker: worker(), online: false, queues: ["celery"] })
  button("control.ping").click()
  button("control.poolGrow").click()
  await flush()
  expect(api.ping).not.toHaveBeenCalled()
  expect(api.grow).not.toHaveBeenCalled()
})
it("validates resize values and requires shrink confirmation before sending the Worker ID", async () => {
  mount(WorkerControls, { worker: worker(), online: true, queues: ["celery"] })
  const input = host.querySelector('input[type="number"]') as HTMLInputElement
  input.value = ""
  input.dispatchEvent(new Event("input"))
  await flush()
  expect(button("control.poolGrow").disabled).toBe(true)
  input.value = "8"
  input.dispatchEvent(new Event("input"))
  await flush()
  expect(button("control.poolShrink").disabled).toBe(true)
  input.value = "2"
  input.dispatchEvent(new Event("input"))
  await flush()
  button("control.poolShrink").click()
  expect(api.shrink).not.toHaveBeenCalled()
  ;(host.querySelector(".confirm") as HTMLButtonElement).click()
  await flush()
  expect(api.shrink).toHaveBeenCalledWith("worker-id", { n: 2 })
})
it("trims queue names and sends a scoped subscription command", async () => {
  mount(WorkerControls, { worker: worker(), online: true, queues: ["celery"] })
  const input = host.querySelector('input:not([type="number"])') as HTMLInputElement
  input.value = " celery "
  input.dispatchEvent(new Event("input"))
  await flush()
  expect(button("detail.subscribe").disabled).toBe(true)
  input.value = " priority "
  input.dispatchEvent(new Event("input"))
  await flush()
  button("detail.subscribe").click()
  await flush()
  expect(api.add).toHaveBeenCalledWith("worker-id", { queue: "priority" })
})
it("restores operation buttons after a failed request", async () => {
  api.ping.mockRejectedValue(new Error("network"))
  mount(WorkerControls, { worker: worker(), online: true, queues: [] })
  button("control.ping").click()
  await flush()
  expect(button("control.ping").disabled).toBe(false)
})
it("routes to records with the exact Worker filter and closes the drawer", async () => {
  const updated = vi.fn()
  mount(WorkerDrawer, { worker: worker(), visible: true, "onUpdate:visible": updated })
  button("viewRecords").click()
  await flush()
  expect(api.push).toHaveBeenCalledWith({
    path: "/queue/task",
    query: { view: "records", worker: "celery@exact-host", range: "7d" },
  })
  expect(updated).toHaveBeenCalledWith(false)
})

it("discards old subscription results after switching Worker", async () => {
  let resolveOld: (value: any) => void = () => {}
  api.detail.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  )
  const props = reactive({ worker: worker(), visible: true })
  mount(WorkerDrawer, props)
  await flush()
  api.detail.mockResolvedValue({ data: { activeQueues: ["current-priority"] }, error: null })
  props.worker = { ...worker(), id: "second-worker" }
  await flush()
  resolveOld({ data: { activeQueues: ["old-subscription"] }, error: null })
  await flush()
  expect(api.detail).toHaveBeenLastCalledWith("second-worker")
  expect(host.textContent).toContain("current-priority")
  expect(host.textContent).not.toContain("old-subscription")
})
it("stopping a subscription requires confirmation", async () => {
  mount(WorkerControls, { worker: worker(), online: true, queues: ["celery"] })
  button("stopSubscription").click()
  expect(api.cancel).not.toHaveBeenCalled()
  ;(host.querySelectorAll(".confirm")[1] as HTMLButtonElement).click()
  await flush()
  expect(api.cancel).toHaveBeenCalledWith("worker-id", { queue: "celery" })
})

it("keeps selected tab, resize input and DOM nodes across same-Worker updates and grow completion", async () => {
  const props = reactive({
    worker: worker(),
    visible: true,
    onUpdated: () => {
      props.worker = { ...props.worker, processedCount: 100 }
    },
  })
  mount(WorkerDrawer, props)
  await flush()
  ;(host.querySelector('[data-tab="operations"]') as HTMLElement).click()
  const input = host.querySelector('input[type="number"]') as HTMLInputElement
  input.value = "4"
  input.dispatchEvent(new Event("input"))
  await flush()
  const root = host.firstElementChild
  props.worker = { ...props.worker, lastHeartbeat: new Date().toISOString(), activeTaskCount: 1 }
  await flush()
  expect(host.querySelector(".tabs")?.getAttribute("data-selected")).toBe("operations")
  expect(host.querySelector('input[type="number"]')).toBe(input)
  expect(input.value).toBe("4")
  expect(host.firstElementChild).toBe(root)
  button("control.poolGrow").click()
  await flush()
  expect(api.grow).toHaveBeenCalledWith("worker-id", { n: 4 })
  expect(host.querySelector(".tabs")?.getAttribute("data-selected")).toBe("operations")
  expect(input.value).toBe("4")
})
