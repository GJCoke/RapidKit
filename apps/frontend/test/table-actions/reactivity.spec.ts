import { reactive } from "vue"
import { expect, it, vi } from "vitest"
import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
import { context, model } from "./fixtures"

it("updates visibility and width without depending on page records", () => {
  const state = reactive({ ready: true, codes: [] as PermissionCode[] })
  const actions = useTableActions(
    () => model,
    () => ({ ...context(state.codes), ready: state.ready }),
  )
  const records = reactive([{ builtin: false, active: true }])
  expect(actions.width.value).toBe(80)
  records.splice(0)
  expect(actions.width.value).toBe(80)
  state.codes.push("user:update", "user:delete")
  expect(actions.width.value).toBe(152)
  state.ready = false
  expect(actions.shown.value).toBe(false)
})

it("rechecks current permissions when a stored confirmation runs", async () => {
  const state = reactive({ codes: ["user:delete"] as PermissionCode[] })
  const actions = useTableActions(
    () => model,
    () => context(state.codes),
  )
  let submissions = 0
  const row = { builtin: false, active: true }
  const confirm = () =>
    actions.run(
      () => row,
      "delete",
      () => {
        submissions += 1
      },
    )
  state.codes = []
  await confirm()
  expect(submissions).toBe(0)
})

it("creates no empty column and bounds an available column width", () => {
  const state = reactive({ ready: false })
  const actions = useTableActions(
    () => model,
    () => ({ ...context(), ready: state.ready }),
  )
  expect(actions.column({ key: "custom-operation", title: "操作" })).toEqual([])
  state.ready = true
  expect(actions.column({ key: "custom-operation", title: "操作" })[0]).toMatchObject({
    key: "custom-operation",
    align: "left",
    width: 80,
    minWidth: 80,
    maxWidth: 80,
  })
})

it("prevents two confirmations for the same row action while the request is pending", async () => {
  const actions = useTableActions(
    () => model,
    () => context(["user:delete"]),
  )
  const row = { builtin: false, active: true }
  let finish!: () => void
  const execute = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const first = actions.run(() => row, "delete", execute)
  const second = actions.run(() => row, "delete", execute)
  expect(execute).toHaveBeenCalledOnce()
  expect(await second).toBe(false)
  finish()
  expect(await first).toBe(true)
})

it("temporarily unpins a wide operation column on mobile without changing its desktop preference", () => {
  const state = reactive({ isMobile: false })
  const actions = useTableActions(
    () => model,
    () => ({ ...context(), isMobile: state.isMobile }),
  )
  expect(actions.column({ key: "operate", fixed: "right" })[0].fixed).toBe("right")
  state.isMobile = true
  expect(actions.column({ key: "operate", fixed: "right" })[0].fixed).toBeUndefined()
  state.isMobile = false
  expect(actions.column({ key: "operate", fixed: "right" })[0].fixed).toBe("right")
})

it("keeps duplicate protection when refresh replaces a pending record object", async () => {
  const actions = useTableActions<{ id: string; builtin: boolean; active: boolean }>(
    () => model,
    () => context(["user:delete"]),
    (row) => row.id,
  )
  let finish!: () => void
  const execute = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const latest = () => ({ id: "record-1", builtin: false, active: true })
  const first = actions.run(latest, "delete", execute)
  const second = actions.run(latest, "delete", execute)
  expect(execute).toHaveBeenCalledOnce()
  expect(await second).toBe(false)
  finish()
  await first
})
