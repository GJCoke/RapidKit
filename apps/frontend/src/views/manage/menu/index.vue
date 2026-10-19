<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import type { Ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { useBoolean } from "@rapidkit/hooks"
  import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
  import { yesOrNoRecord } from "@/constants/common"
  import { enableStatusRecord, menuTypeRecord } from "@/constants/business"
  import { fetchBatchDeleteMenus, fetchDeleteMenu, fetchGetAllPages, fetchGetMenuList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import SvgIcon from "@/components/custom/svg-icon.vue"
  import { createMenuActionModel } from "./modules/table-actions"
  import MenuOperateModal, { type OperateType } from "./modules/menu-operate-modal.vue"

  const appStore = useAppStore()
  const { hasAuth, getActionContext } = useAuth()

  const { bool: visible, setTrue: openModal } = useBoolean()

  const wrapperRef = ref<HTMLElement | null>(null)

  const actions = useTableActions(() => createMenuActionModel<Api.SystemManage.Menu>(), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)

  const searchParams: Api.SystemManage.RoleSearchParams = reactive({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const { columns, columnChecks, scrollX, data, loading, pagination, getData, getDataByPage } = useNaivePaginatedTable({
    api: () => fetchGetMenuList(searchParams),
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page
      searchParams.pageSize = params.pageSize
    },
    transform: (response) => defaultTransform(response),
    columns: () => [
      {
        type: "selection",
        align: "center",
        width: 48,
      },
      {
        key: "id",
        title: $t("page.manage.menu.id"),
        align: "center",
        ellipsis: true,
      },
      {
        key: "menuType",
        title: $t("page.manage.menu.menuType"),
        align: "center",
        width: 80,
        render: (row) => {
          const tagMap: Record<Api.SystemManage.MenuType, NaiveUI.ThemeColor> = {
            1: "default",
            2: "primary",
          }

          const label = $t(menuTypeRecord[row.menuType])

          return <NTag type={tagMap[row.menuType]}>{label}</NTag>
        },
      },
      {
        key: "menuName",
        title: $t("page.manage.menu.menuName"),
        align: "center",
        minWidth: 120,
        render: (row) => {
          const { i18nKey, menuName } = row

          const label = i18nKey ? $t(i18nKey as I18nFullKey) : menuName

          return <span>{label}</span>
        },
      },
      {
        key: "icon",
        title: $t("page.manage.menu.icon"),
        align: "center",
        width: 60,
        render: (row) => {
          const icon = row.iconType === "1" ? (row.icon ?? undefined) : undefined

          const localIcon = row.iconType === "2" ? (row.icon ?? undefined) : undefined

          return (
            <div class="flex-center">
              <SvgIcon icon={icon} localIcon={localIcon} class="text-icon" />
            </div>
          )
        },
      },
      {
        key: "routeName",
        title: $t("page.manage.menu.routeName"),
        align: "center",
        minWidth: 120,
      },
      {
        key: "routePath",
        title: $t("page.manage.menu.routePath"),
        align: "center",
        minWidth: 120,
        ellipsis: { tooltip: true },
      },
      {
        key: "status",
        title: $t("page.manage.menu.menuStatus"),
        align: "center",
        width: 80,
        render: (row) => {
          if (row.status === null) {
            return null
          }

          const tagMap: Record<Api.Common.EnableStatus, NaiveUI.ThemeColor> = {
            1: "success",
            2: "warning",
          }

          const label = $t(enableStatusRecord[row.status])

          return <NTag type={tagMap[row.status]}>{label}</NTag>
        },
      },
      {
        key: "hideInMenu",
        title: $t("page.manage.menu.hideInMenu"),
        align: "center",
        width: 80,
        render: (row) => {
          const hide: CommonType.YesOrNo = row.hideInMenu ? "Y" : "N"

          const tagMap: Record<CommonType.YesOrNo, NaiveUI.ThemeColor> = {
            Y: "error",
            N: "default",
          }

          const label = $t(yesOrNoRecord[hide])

          return <NTag type={tagMap[hide]}>{label}</NTag>
        },
      },
      {
        key: "parentId",
        title: $t("page.manage.menu.parentId"),
        width: 90,
        align: "center",
        ellipsis: true,
      },
      {
        key: "order",
        title: $t("page.manage.menu.order"),
        align: "center",
        width: 60,
      },
      ...actions.column({
        key: "operate",
        title: $t("common.operate"),
        render: (row) => (
          <div class="flex items-center justify-start flex-nowrap gap-8px whitespace-nowrap">
            {actions.visible(row, "addChild") && (
              <NButton type="primary" ghost size="small" onClick={() => handleAddChildMenu(row)}>
                {$t("page.manage.menu.addChildMenu")}
              </NButton>
            )}
            {actions.visible(row, "edit") && (
              <NButton type="primary" ghost size="small" onClick={() => handleEdit(row)}>
                {$t("common.edit")}
              </NButton>
            )}
            {actions.visible(row, "delete") && (
              <NPopconfirm onPositiveClick={() => actions.run(() => data.value.find((item) => item.id === row.id), "delete", (latest) => handleDelete(latest.id))}>
                {{
                  default: () => $t("common.confirmDelete"),
                  trigger: () => (
                    <NButton type="error" ghost size="small">
                      {$t("common.delete")}
                    </NButton>
                  ),
                }}
              </NPopconfirm>
            )}
          </div>
        ),
      }),
    ],
  })

  const { checkedRowKeys, onBatchDeleted, onDeleted } = useTableOperate(data, "id", getData)

  const operateType = ref<OperateType>("add")

  function handleAdd() {
    operateType.value = "add"
    openModal()
  }

  async function handleBatchDelete() {
    if (!hasAuth("menu:delete")) return
    const { error } = await fetchBatchDeleteMenus(checkedRowKeys.value as string[])
    if (error) return
    onBatchDeleted()
  }

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteMenu(id)
    if (error) return
    onDeleted()
  }

  /** the edit menu data or the parent menu data when adding a child menu */
  const editingData: Ref<Api.SystemManage.Menu | null> = ref(null)

  function handleEdit(item: Api.SystemManage.Menu) {
    operateType.value = "edit"
    editingData.value = { ...item }

    openModal()
  }

  function handleAddChildMenu(item: Api.SystemManage.Menu) {
    operateType.value = "addChild"

    editingData.value = { ...item }

    openModal()
  }

  const allPages = ref<string[]>([])

  async function getAllPages() {
    const { data: pages } = await fetchGetAllPages()
    allPages.value = pages || []
  }

  function init() {
    getAllPages()
  }

  // init
  init()
</script>

<template>
  <div ref="wrapperRef" class="flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard :title="$t('page.manage.menu.title')" :bordered="false" size="small" class="card-wrapper sm:flex-1-hidden">
      <template #header-extra>
        <TableHeaderOperation
          :show-business-actions="hasAuth('menu:create') || hasAuth('menu:delete')"
          v-model:columns="columnChecks"
          :loading="loading"
          @refresh="getData"
        >
          <NButton v-if="hasAuth('menu:create')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
          <NPopconfirm v-if="hasAuth('menu:delete')" @positive-click="handleBatchDelete">
            <template #trigger>
              <NButton size="small" ghost type="error" :disabled="checkedRowKeys.length === 0">
                <template #icon>
                  <icon-ic-round-delete class="text-icon" />
                </template>
                {{ $t("common.batchDelete") }}
              </NButton>
            </template>
            {{ $t("common.confirmDelete") }}
          </NPopconfirm>
        </TableHeaderOperation>
      </template>
      <NDataTable
        v-model:checked-row-keys="checkedRowKeys"
        :columns="columns"
        :data="data"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="scrollX"
        :loading="loading"
        :row-key="(row) => row.id"
        remote
        :pagination="pagination"
        class="sm:h-full"
      />
      <MenuOperateModal
        v-model:visible="visible"
        :operate-type="operateType"
        :row-data="editingData"
        :all-pages="allPages"
        @submitted="getDataByPage"
      />
    </NCard>
  </div>
</template>

<style scoped></style>
