// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue"
import { expect, it, vi } from "vitest"
import TableHeaderOperation from "@/components/advanced/table-header-operation.vue"
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

it("hides an empty business group while retaining search and refresh", async () => {
  const show = ref(false)
  const host = document.createElement("div")
  const app = createApp({
    render: () =>
      h(
        TableHeaderOperation,
        { showBusinessActions: show.value, showColumnSetting: false },
        {
          default: () => h("button", { "data-business": "" }, "Create"),
          prefix: () => h("input", { "aria-label": "Search" }),
        },
      ),
  })
  try {
    app.mount(host)
    expect(host.querySelector("[data-business]")).toBeNull()
    expect(host.querySelector('[aria-label="Search"]')).not.toBeNull()
    expect(host.textContent).toContain("common.refresh")
    show.value = true
    await nextTick()
    expect(host.querySelector("[data-business]")).not.toBeNull()
  } finally {
    app.unmount()
  }
})
