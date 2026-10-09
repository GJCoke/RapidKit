import { effectScope, nextTick, reactive, ref } from "vue"
import { afterEach, describe, expect, it } from "vitest"
import { useLogViewer } from "../../src/components/common/log-viewer/use-log-viewer"
import type { LogRecord, LogViewerProps } from "../../src/components/common/log-viewer/types"
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach((s) => s.stop()))
function setup(initial: LogViewerProps) {
  const props = reactive(initial),
    follow = ref(true),
    scope = effectScope()
  scopes.push(scope)
  const ui = scope.run(() => useLogViewer(props, follow))!
  return { props, follow, ui }
}
function scroll(top: number, height = 200, client = 100) {
  return { target: { scrollTop: top, scrollHeight: height, clientHeight: client } } as unknown as Event
}
describe("log follow state", () => {
  it("counts only matching additions while paused, including in-place pushes", async () => {
    const { props, follow, ui } = setup({ records: [{ id: 1, message: "start", level: "INFO" }], maxEntries: 2 })
    ui.level.value = "ERROR"
    await nextTick()
    follow.value = false
    ;(props.records as LogRecord[]).push(
      { id: 2, message: "ignore", level: "INFO" },
      { id: 3, message: "failed", level: "ERROR" },
    )
    await nextTick()
    expect(follow.value).toBe(false)
    expect(ui.pending.value).toBe(1)
    expect(ui.omitted.value).toBe(1)
    expect(ui.visible.value.map((e) => e.id)).toEqual([3])
  })
  it("recognizes a same-length rolling window as new records rather than reset", async () => {
    const { props, follow, ui } = setup({
      records: [
        { id: 1, message: "a" },
        { id: 2, message: "b" },
      ],
    })
    follow.value = false
    props.records = [
      { id: 2, message: "b" },
      { id: 3, message: "c" },
    ]
    await nextTick()
    expect(follow.value).toBe(false)
    expect(ui.pending.value).toBe(1)
  })
  it("resets on source replacement even if IDs are reused with changed messages", async () => {
    const { props, follow, ui } = setup({ records: [{ id: 1, message: "first" }] })
    follow.value = false
    props.records = [{ id: 1, message: "replacement" }]
    await nextTick()
    expect(follow.value).toBe(true)
    expect(ui.pending.value).toBe(0)
  })
  it("counts new physical lines but not extending the last partial text line", async () => {
    const { props, follow, ui } = setup({ log: "start\npar" })
    follow.value = false
    props.log = "start\npartial"
    await nextTick()
    expect(ui.pending.value).toBe(0)
    expect(follow.value).toBe(false)
    props.log += "\nnext\n"
    await nextTick()
    expect(ui.pending.value).toBe(1)
    props.log = "different"
    await nextTick()
    expect(follow.value).toBe(true)
  })
  it("resets pending on filter changes and restores follow on sourceKey changes", async () => {
    const { props, follow, ui } = setup({ log: "one", sourceKey: "a" })
    follow.value = false
    props.log += "\ntwo"
    await nextTick()
    expect(ui.pending.value).toBe(1)
    ui.query.value = "one"
    await nextTick()
    expect(ui.pending.value).toBe(0)
    expect(follow.value).toBe(false)
    props.sourceKey = "b"
    await nextTick()
    expect(follow.value).toBe(true)
  })
  it("pauses above bottom threshold and resumes at the bottom", () => {
    const { follow, ui } = setup({ log: "one" })
    ui.onScroll(scroll(75))
    expect(follow.value).toBe(false)
    ui.onScroll(scroll(76))
    expect(follow.value).toBe(true)
    follow.value = false
    ui.resume()
    expect(follow.value).toBe(true)
  })
})
