<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { enableStatusRecord } from "@/constants/business"
  import { fetchDeleteDataPolicy, fetchGetDataPolicyList } from "@/service/api/system-manage"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import DataPolicyOperateDrawer from "./modules/data-policy-operate-drawer.vue"
  import PolicySimulator from "./modules/policy-simulator.vue"

  defineOptions({ name: "ManageDataPolicy" })

  const appStore = useAppStore()
  const { hasAuth } = useAuth()

  const searchParams: Api.DataPolicy.PolicySearchParams = reactive({
    page: 1,
    pageSize: 10,
  })

  const { columns, columnChecks, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetDataPolicyList(searchParams),
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
        title: $t("page.manage.dataPolicy.name"),
        minWidth: 150,
      },
      {
        key: "targetModel",
        title: $t("page.manage.dataPolicy.ruleEditor.targetModel"),
        minWidth: 140,
      },
      {
        key: "description",
        title: $t("page.manage.dataPolicy.description"),
        minWidth: 200,
        ellipsis: { tooltip: true },
      },
      {
        key: "status",
        title: $t("page.manage.dataPolicy.status"),
        align: "center",
        width: 100,
        render: (row) => {
          if (row.status === null) return null
          const tagMap: Record<Api.Common.EnableStatus, NaiveUI.ThemeColor> = {
            1: "success",
            2: "warning",
          }
          const label = $t(enableStatusRecord[row.status])
          return <NTag type={tagMap[row.status]}>{label}</NTag>
        },
      },
      {
        key: "createTime",
        title: $t("page.manage.dataPolicy.createTime"),
        width: 180,
      },
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 130,
        render: (row) => (
          <div class="flex-center gap-8px">
            {hasAuth("manage_data-policy:edit") && (
              <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
                {$t("common.edit")}
              </NButton>
            )}
            {hasAuth("manage_data-policy:delete") && (
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

  const simulatorVisible = ref(false)

  const {
    drawerVisible,
    operateType,
    editingData,
    handleAdd,
    handleEdit,
    checkedRowKeys,
    onDeleted,
  } = useTableOperate(data, "id", getData)

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteDataPolicy(id)
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
      :title="$t('page.manage.dataPolicy.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
          <NButton v-if="hasAuth('manage_data-policy:add')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
          <NButton
            v-if="hasAuth('manage_data-policy:edit')"
            size="small"
            ghost
            type="info"
            @click="simulatorVisible = true"
          >
            <template #icon>
              <icon-ic-round-science class="text-icon" />
            </template>
            {{ $t("page.manage.dataPolicy.simulator.title") }}
          </NButton>
        </TableHeaderOperation>
      </template>
      <NDataTable
        v-model:checked-row-keys="checkedRowKeys"
        :columns="columns"
        :data="data"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="962"
        :loading="loading"
        remote
        :row-key="(row) => row.id"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
    </NCard>

    <DataPolicyOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      @submitted="getDataByPage"
    />

    <PolicySimulator v-model:visible="simulatorVisible" />
  </div>
</template>
