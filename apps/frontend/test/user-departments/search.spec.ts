// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { expect, it, vi } from "vitest"
import UserSearch from "@/views/manage/user/modules/user-search.vue"

vi.mock("@/locales", () => ({ $t: (key: string) => key }))

it("reset clears the visible keyword and status while retaining the selected department", async () => {
  const model = reactive<Api.SystemManage.UserSearchParams>({ keyword: undefined, status: "1", departmentId: "root" })
  const searches: unknown[] = []
  const host = document.createElement("div")
  const app = createApp({ render: () => h(UserSearch, { model, onSearch: () => searches.push({ ...model }) }) })
  app.mount(host)
  try {
    const input = host.querySelector("input")!
    input.value = "guest"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    expect(model.keyword).toBe("guest")
    const reset = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("common.reset"))!
    reset.click()
    await nextTick()
    expect(host.querySelector("input")!.value).toBe("")
    expect(host.querySelector(".n-base-selection-label")?.textContent).not.toContain("common.status.enable")
    expect(searches).toHaveLength(1)
    expect(model.departmentId).toBe("root")
  } finally {
    app.unmount()
  }
})
