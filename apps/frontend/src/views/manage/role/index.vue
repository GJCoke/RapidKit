<script setup lang="tsx">
  import { reactive } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { enableStatusRecord } from "@/constants/business"
  import { fetchBatchDeleteRoles, fetchDeleteRole, fetchGetRoleList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import RoleOperateDrawer from "./modules/role-operate-drawer.vue"
  import RoleSearch from "./modules/role-search.vue"

  const appStore = useAppStore()
  const { hasAuth } = useAuth()

  const searchParams: Api.SystemManage.RoleSearchParams = reactive({
    page: 1,
    pageSize: 10,
    keyword: undefined,
    status: undefined,
  })

  const { columns, columnChecks, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
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
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 130,
        render: (row) => (
          <div class="flex-center gap-8px">
            {hasAuth("manage_role:edit") && (
              <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
                {$t("common.edit")}
              </NButton>
            )}
            {hasAuth("manage_role:delete") && (
              <NPopconfirm onPositiveClick={() => handleDelete(row.id)}>
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
      },
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
          v-model:columns="columnChecks"
          :disabled-delete="checkedRowKeys.length === 0"
          :loading="loading"
          @add="handleAdd"
          @delete="handleBatchDelete"
          @refresh="getData"
        >
          <NButton v-if="hasAuth('manage_role:add')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
          <NPopconfirm v-if="hasAuth('manage_role:delete')" @positive-click="handleBatchDelete">
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
        :scroll-x="702"
        :loading="loading"
        remote
        :row-key="(row) => row.id"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
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
