<script setup lang="tsx">
  import { reactive, shallowRef } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
  import { enableStatusRecord } from "@/constants/business"
  import { fetchBatchDeleteRoles, fetchDeleteRole, fetchGetRoleList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { createRoleActionModel } from "./modules/table-actions"
  import RoleOperateDrawer from "./modules/role-operate-drawer.vue"
  import RoleSearch from "./modules/role-search.vue"
  import ApplyPackageModal from "./modules/apply-package-modal.vue"

  const appStore = useAppStore()
  const { hasAuth, getActionContext } = useAuth()

  const applyRoleId = shallowRef("")
  const applyVisible = shallowRef(false)
  function openApplyPackages(roleId: string) {
    applyRoleId.value = roleId
    applyVisible.value = true
  }
  const actions = useTableActions(() => createRoleActionModel<Api.SystemManage.Role>(), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)

  const searchParams: Api.SystemManage.RoleSearchParams = reactive({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: undefined,
    status: undefined,
  })

  const { columns, columnChecks, scrollX, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetRoleList(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page
      searchParams.pageSize = params.pageSize
    },
    columns: () => [
      {
        type: "selection",
        align: "center",
        width: 48,
      },
      {
        key: "index",
        title: $t("common.index"),
        width: 64,
        align: "center",
        render: (_, index) => index + 1,
      },
      {
        key: "name",
        title: $t("page.manage.role.roleName"),
        align: "center",
        minWidth: 120,
      },
      {
        key: "code",
        title: $t("page.manage.role.roleCode"),
        align: "center",
        minWidth: 120,
      },
      {
        key: "description",
        title: $t("page.manage.role.roleDesc"),
        minWidth: 120,
      },
      {
        key: "status",
        title: $t("page.manage.role.roleStatus"),
        align: "center",
        width: 100,
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
      ...actions.column({
        key: "operate",
        title: $t("common.operate"),
        render: (row) => (
          <div class="flex items-center justify-start flex-nowrap gap-8px whitespace-nowrap">
            {actions.visible(row, "grant") && (
              <NButton type="primary" ghost size="small" onClick={() => openApplyPackages(row.id)}>
                {$t("page.manage.role.applyPackage.button")}
              </NButton>
            )}
            {actions.visible(row, "edit") && (
              <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
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

  const {
    drawerVisible,
    operateType,
    editingData,
    handleAdd,
    handleEdit,
    checkedRowKeys,
    onBatchDeleted,
    onDeleted,
    // closeDrawer
  } = useTableOperate(data, "id", getData)

  async function handleBatchDelete() {
    if (!hasAuth("role:delete")) return
    const { error } = await fetchBatchDeleteRoles(checkedRowKeys.value as string[])
    if (error) return
    onBatchDeleted()
  }

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteRole(id)
    if (error) return
    onDeleted()
  }

  function edit(id: string) {
    handleEdit(id)
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <RoleSearch v-model:model="searchParams" @search="getDataByPage" />
    <NCard :title="$t('page.manage.role.title')" :bordered="false" size="small" class="card-wrapper sm:flex-1-hidden">
      <template #header-extra>
        <TableHeaderOperation
          :show-business-actions="hasAuth('role:create') || hasAuth('role:delete')"
          v-model:columns="columnChecks"
          :loading="loading"
          @refresh="getData"
        >
          <NButton v-if="hasAuth('role:create')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
          <NPopconfirm v-if="hasAuth('role:delete')" @positive-click="handleBatchDelete">
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
        remote
        :row-key="(row) => row.id"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
      <ApplyPackageModal v-model:visible="applyVisible" :role-id="applyRoleId" @applied="getData" />
      <RoleOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
    </NCard>
  </div>
</template>

<style scoped></style>
