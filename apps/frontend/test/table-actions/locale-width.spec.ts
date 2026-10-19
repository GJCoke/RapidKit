import { effectScope, nextTick, ref } from "vue"
import { afterEach, expect, it, vi } from "vitest"
import { $t, getLocale, setLocale } from "@/locales"
import { residentActionModel } from "@/hooks/business/table-actions/layout"
import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
import type { ActionModel } from "@/hooks/business/table-actions/types"
import { useNaivePaginatedTable, useNaiveTable } from "@/hooks/common/table"
import { createRoleActionModel } from "@/views/manage/role/modules/table-actions"
import { createMenuActionModel } from "@/views/manage/menu/modules/table-actions"
import { createUserActionModel } from "@/views/manage/user/composables/user-actions"
import { createPackageActionModel } from "@/views/manage/permission-package/modules/package-actions"
import { createScheduleActionModel } from "@/views/queue/schedule/modules/table-actions"
import { createTaskActionModel } from "@/views/queue/task/modules/task-actions"
import { createAnnouncementActionModel } from "@/views/notification/manage/announcements/modules/announcement-table"
import { context } from "./fixtures"

vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const enCommon = (await import("@/locales/langs/en-US/common.json")).default
  const enPage = (await import("@/locales/langs/en-US/page.json")).default
  const zhCommon = (await import("@/locales/langs/zh-CN/common.json")).default
  const zhPage = (await import("@/locales/langs/zh-CN/page.json")).default
  const i18n = createI18n({
    legacy: false,
    locale: "zh-CN",
    messages: { "en-US": { common: enCommon, page: enPage }, "zh-CN": { common: zhCommon, page: zhPage } },
  })
  return {
    $t: i18n.global.t,
    getLocale: () => i18n.global.locale.value,
    setLocale: (locale: "zh-CN" | "en-US") => {
      i18n.global.locale.value = locale
    },
  }
})
vi.mock("@/store/modules/app", () => ({
  useAppStore: () => ({
    get locale() {
      return getLocale()
    },
    isMobile: false,
  }),
}))
afterEach(() => setLocale("zh-CN"))

function translatedWidths<Row>(create: () => ActionModel<Row>) {
  const actions = useTableActions(create, () => ({ ...context(), locale: getLocale(), hasAuth: () => true }))
  const chinese = actions.width.value
  setLocale("en-US")
  expect(actions.width.value).toBeGreaterThan(chinese)
  setLocale("zh-CN")
  expect(actions.width.value).toBe(chinese)
}

it.each([
  ["user", () => translatedWidths(createUserActionModel)],
  ["role", () => translatedWidths(createRoleActionModel)],
  ["menu", () => translatedWidths(createMenuActionModel)],
  ["package", () => translatedWidths(createPackageActionModel)],
  ["schedule", () => translatedWidths(createScheduleActionModel)],
  ["task", () => translatedWidths(createTaskActionModel)],
  ["announcement", () => translatedWidths(createAnnouncementActionModel)],
  ["resident detail", () => translatedWidths(() => residentActionModel({ detail: $t("common.detail") }))],
] as const)("recomputes the %s model from actual translations", (_, verify) => verify())

it.each([false, true])(
  "updates rendered columns and scrolling after language and permission changes (paginated=%s)",
  async (paginated) => {
    const scope = effectScope()
    const codes = ref<PermissionCode[]>(["role:grant", "role:update", "role:delete"])
    try {
      const table = scope.run(() => {
        const actions = useTableActions(
          () => createRoleActionModel<object>(),
          () => ({ ...context(codes.value), locale: getLocale() }),
        )
        const columns = () => [
          { key: "name", title: "Name", minWidth: 120 },
          ...actions.column({ key: "operate", title: $t("common.operate") }),
        ]
        return paginated
          ? useNaivePaginatedTable({
              immediate: false,
              api: async () => [],
              transform: () => ({ data: [], pageNum: 1, pageSize: 20, total: 0 }),
              columns,
            })
          : useNaiveTable({ immediate: false, api: async () => [], transform: () => [], columns })
      })!
      const chinese = table.columns.value.at(-1)!.width as number
      setLocale("en-US")
      await nextTick()
      const english = table.columns.value.at(-1)!.width as number
      expect(english).toBeGreaterThan(chinese)
      expect(table.scrollX.value).toBe(120 + english)
      codes.value = ["role:update"]
      await nextTick()
      expect(table.columns.value.at(-1)!.width).toBeLessThan(english)
      codes.value = []
      await nextTick()
      expect(table.columns.value.map((column) => "key" in column && column.key)).toEqual(["name"])
      expect(table.scrollX.value).toBe(120)
      expect(table.data.value).toEqual([])
    } finally {
      scope.stop()
    }
  },
)
