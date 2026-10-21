// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import AuditLogSearch from "./audit-log-search.vue"

vi.mock("@/service/api", () => ({ fetchGetAuditLogActors: vi.fn().mockResolvedValue({ data: [], error: null }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

const cleanups: Array<() => void> = []
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

function mount(filters: Api.SystemManage.AuditLogQuery) {
  const model = ref(filters)
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({
    render: () =>
      h(AuditLogSearch, {
        model: model.value,
        catalog: {
          timezone: "Asia/Shanghai",
          actions: ["department", "user"].map((resourceType) => ({
            code: `${resourceType}.create`,
            label: `Create ${resourceType}`,
            resourceType,
            resourceLabel: resourceType,
            riskLevel: "normal" as const,
            fields: {},
          })),
        },
        "onUpdate:model": (value) => {
          model.value = value
        },
      }),
  })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, model }
}

it("clears the displayed resource type when switching from object history to a request", async () => {
  const { host, model } = mount({})
  const selection = host.querySelectorAll(".n-select")[1].querySelector(".n-base-selection")!
  selection.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  await nextTick()
  selection.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  await nextTick()
  expect(model.value.resourceType).toBe("department")
  expect(host.textContent).toContain("department")
  model.value = { requestId: "request-1", page: 1 }
  await nextTick()
  expect([...host.querySelectorAll(".n-base-selection-label")].map((node) => node.textContent).join(" ")).not.toContain(
    "department",
  )
  model.value = { resourceType: "user", resourceId: "user-1", page: 1 }
  await nextTick()
  expect([...host.querySelectorAll(".n-base-selection-label")].map((node) => node.textContent).join(" ")).toContain(
    "user",
  )
})

it("reveals related filters on initial navigation and when switching queries", async () => {
  const { host, model } = mount({ resourceId: "department-1", resourceType: "department" })
  await nextTick()
  expect([...host.querySelectorAll("input")].some((input) => input.value === "department-1")).toBe(true)
  ;(host.querySelector(".n-collapse-item__header-main") as HTMLElement).click()
  await nextTick()
  model.value = { requestId: "request-1", page: 1 }
  await nextTick()
  expect(host.querySelector(".n-collapse-item--active")).not.toBeNull()
  expect([...host.querySelectorAll("input")].some((input) => input.value === "request-1")).toBe(true)
})

it("clears manually entered text filters on reset and restores the default day", async () => {
  const { host, model } = mount({ requestId: "initial-request", pageSize: 50 })
  await nextTick()
  const inputs = [...host.querySelectorAll<HTMLInputElement>(".n-collapse-item .n-input input")]
  expect(inputs).toHaveLength(8)
  inputs.forEach((input, index) => {
    input.value = `filter-${index}`
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await nextTick()
  expect(model.value.resourceId).toBe("filter-1")
  ;([...host.querySelectorAll("button")].find((button) => button.textContent === "common.reset") as HTMLElement).click()
  await nextTick()
  expect(
    [...host.querySelectorAll<HTMLInputElement>(".n-collapse-item .n-input input")].map((input) => input.value),
  ).toEqual(["", "", "", "", "", "", "", ""])
  expect(model.value.resourceId).toBeUndefined()
  expect(model.value.requestId).toBeUndefined()
  expect(model.value.page).toBe(1)
  expect(model.value.pageSize).toBe(50)
  expect(Date.parse(model.value.endTime!) - Date.parse(model.value.startTime!)).toBe(86400000)
})
