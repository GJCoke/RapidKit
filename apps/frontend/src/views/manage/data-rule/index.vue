<script setup lang="tsx">
  import { reactive } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { dataRuleOperatorRecord } from "@/constants/business"
  import { fetchDeleteDataRule, fetchGetDataRuleList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import DataRuleOperateDrawer from "./modules/data-rule-operate-drawer.vue"

  defineOptions({ name: "ManageDataRule" })

  const appStore = useAppStore()
  const { hasAuth } = useAuth()

  const searchParams: Api.SystemManage.DataRuleSearchParams = reactive({
    page: 1,
    pageSize: 10,
  })

  const { columns, columnChecks, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetDataRuleList(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page ?? 1
      searchParams.pageSize = params.pageSize ?? 10
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
        title: $t("page.manage.dataRule.name"),
        align: "center",
        minWidth: 120,
      },
      {
        key: "modelName",
        title: $t("page.manage.dataRule.modelName"),
        align: "center",
        minWidth: 120,
        render: (row) => <NTag size="small">{row.modelName}</NTag>,
      },
      {
        key: "field",
        title: $t("page.manage.dataRule.field"),
        align: "center",
        minWidth: 100,
      },
      {
        key: "operator",
        title: $t("page.manage.dataRule.operator"),
        align: "center",
        width: 100,
        render: (row) => {
          const key = row.operator as keyof typeof dataRuleOperatorRecord
          const label = dataRuleOperatorRecord[key] ? $t(dataRuleOperatorRecord[key]) : row.operator
          return <NTag size="small" type="info">{label}</NTag>
        },
      },
      {
        key: "value",
        title: $t("page.manage.dataRule.value"),
        align: "center",
        minWidth: 120,
        ellipsis: { tooltip: true },
      },
      {
        key: "logic",
        title: $t("page.manage.dataRule.logic"),
        align: "center",
        width: 80,
        render: (row) => <NTag size="small" type={row.logic === "OR" ? "warning" : "default"}>{row.logic}</NTag>,
      },
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 130,
        render: (row) => (
          <div class="flex-center gap-8px">
            {hasAuth("manage_data-rule:edit") && (
              <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
                {$t("common.edit")}
              </NButton>
            )}
            {hasAuth("manage_data-rule:delete") && (
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

  const { drawerVisible, operateType, editingData, handleAdd, handleEdit, checkedRowKeys, onDeleted } =
    useTableOperate(data, "id", getData)

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteDataRule(id)
    if (error) return
    onDeleted()
  }

  function edit(id: string) {
    handleEdit(id)
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard
      :title="$t('page.manage.dataRule.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
          <NButton v-if="hasAuth('manage_data-rule:add')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
        </TableHeaderOperation>
      </template>
      <NDataTable
        v-model:checked-row-keys="checkedRowKeys"
        :columns="columns"
        :data="data"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="900"
        :loading="loading"
        remote
        :row-key="(row) => row.id"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
      <DataRuleOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
    </NCard>
  </div>
</template>

<style scoped></style>
