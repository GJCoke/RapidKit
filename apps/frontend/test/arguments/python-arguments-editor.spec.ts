import { effectScope, nextTick, ref } from "vue"
import { describe, expect, it } from "vitest"
import { usePythonArguments } from "../../src/components/common/python-arguments-editor/use-python-arguments"
import type { PythonArguments } from "../../src/components/common/python-arguments-editor/arguments"

function setup() {
  const scope = effectScope()
  const model = ref<PythonArguments>({ args: [], kwargs: {} })
  const editor = scope.run(() => usePythonArguments(model))!
  return { scope, model, ...editor }
}

describe("argument editor state", () => {
  it("preserves JSON draft formatting across model updates and reorders arguments", async () => {
    const ui = setup()
    ui.args.value.push({ type: "json", value: "  [1, 2]  " }, { type: "string", value: "second" })
    await nextTick()
    expect(ui.model.value.args).toEqual([[1, 2], "second"])
    expect(ui.args.value[0]!.value).toBe("  [1, 2]  ")
    ui.move(1, -1)
    await nextTick()
    expect(ui.model.value.args).toEqual(["second", [1, 2]])
    ui.move(0, -1)
    expect(ui.model.value.args).toEqual(["second", [1, 2]])
    ui.scope.stop()
  })
  it("synchronizes a dragged row order while preserving JSON drafts and keyword arguments", () => {
    const ui = setup()
    ui.args.value.push({ type: "json", value: "  [1, 2]  " }, { type: "string", value: "second" })
    ui.kwargs.value.push({ key: "name", type: "boolean", value: "false" })
    ui.args.value = [...ui.args.value].reverse()
    expect(ui.model.value).toEqual({ args: ["second", [1, 2]], kwargs: { name: false } })
    expect(ui.args.value[1]!.value).toBe("  [1, 2]  ")
    ui.scope.stop()
  })
  it("blocks invalid drafts, recovers after correction and reloads external data", async () => {
    const ui = setup()
    ui.kwargs.value.push({ key: "", type: "string", value: "test" })
    await nextTick()
    expect(ui.commit()).toBe(false)
    expect(ui.model.value.kwargs).toEqual({})
    ui.kwargs.value[0]!.key = "name"
    expect(ui.commit()).toBe(true)
    expect(ui.model.value.kwargs).toEqual({ name: "test" })
    ui.model.value = { args: [false, null], kwargs: { name: "hello" } }
    await nextTick()
    expect(ui.args.value.map((row) => row.type)).toEqual(["boolean", "none"])
    expect(ui.kwargs.value[0]!.value).toBe("hello")
    ui.scope.stop()
  })
})
