import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PythonArgumentsEditor from "../../src/components/common/python-arguments-editor/index.vue"

const draggable = vi.hoisted(() => ({ instances: [] as Record<string, any>[] }))
vi.mock("naive-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("naive-ui")>()),
  NSelect: defineComponent({ render: () => h("div") }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("vue-draggable-plus", () => ({
  VueDraggable: defineComponent({
    inheritAttrs: false,
    props: ["modelValue", "preventOnFilter"],
    setup(props, { attrs, slots }) {
      draggable.instances.push({ ...props, ...attrs })
      return () => h("div", slots.default?.())
    },
  }),
}))

async function render(disabled = false) {
  const updates: unknown[] = []
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(PythonArgumentsEditor, {
          modelValue: { args: ["first", 2], kwargs: { name: "value" } },
          disabled,
          showPreview: false,
          "onUpdate:modelValue": (value: unknown) => updates.push(value),
        }),
    }),
  )
  return { html, updates }
}

beforeEach(() => {
  draggable.instances.length = 0
})

describe("positional argument drag sorting", () => {
  it("uses only headers as handles and excludes the action group without blocking clicks", async () => {
    const { html } = await render()
    const args = draggable.instances[0]!
    expect(args.handle).toBe(".argument-drag-handle")
    expect(args.filter).toBe(".argument-actions")
    expect(args.preventOnFilter).toBe(false)
    expect(args.disabled).toBe(false)
    expect(draggable.instances[1]!.disabled).toBe(true)
    expect((html.match(/argument-drag-handle/g) ?? []).length).toBe(2)
    expect((html.match(/argument-actions/g) ?? []).length).toBe(3)
    expect(args["onUpdate:modelValue"]).toBeTypeOf("function")
  })

  it("removes drag handles and rejects drag updates when disabled", async () => {
    const { html, updates } = await render(true)
    expect(html).not.toContain("argument-drag-handle")
    const args = draggable.instances[0]!
    expect(args.disabled).toBe(true)
    args["onUpdate:modelValue"]([...args.modelValue].reverse())
    expect(updates).toEqual([])
  })
})
