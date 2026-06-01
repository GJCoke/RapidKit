<script setup lang="tsx">
  import { reactive } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { enableStatusRecord } from "@/constants/business"
  import {
    fetchBatchDeleteFieldPolicies,
    fetchDeleteFieldPolicy,
    fetchGetFieldPolicyList,
  } from "@/service/api/system-manage"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import FieldPolicyOperateDrawer from "./modules/field-policy-operate-drawer.vue"

  defineOptions({ name: "ManageFieldPolicy" })

  const appStore = useAppStore()
  const { hasAuth } = useAuth()

  const searchParams: Api.FieldPolicy.PolicySearchParams = reactive({
    page: 1,
    pageSize: 10,
  })

  const { columns, columnChecks, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetFieldPolicyList(searchParams),
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
        title: $t("page.manage.fieldPolicy.name"),
        minWidth: 120,
      },
      {
        key: "targetModel",
        title: $t("page.manage.fieldPolicy.targetModel"),
        minWidth: 120,
      },
      {
        key: "fields",
        title: $t("page.manage.fieldPolicy.fields"),
        minWidth: 180,
        render: (row) => {
          const fields = row.fields || []
          const shown = fields.slice(0, 3)
          const extra = fields.length - 3
          return (
            <div class="flex flex-wrap gap-4px">
              {shown.map((f: string) => (
                <NTag size="small" type="info">
                  {f}
                </NTag>
              ))}
              {extra > 0 && (
                <NTag size="small" type="default">
                  +{extra}
                </NTag>
              )}
            </div>
          )
        },
      },
      {
        key: "effect",
        title: $t("page.manage.fieldPolicy.effect"),
        width: 80,
        align: "center",
        render: (row) => {
          const typeMap: Record<string, NaiveUI.ThemeColor> = {
            strip: "info",
            mask: "warning",
            deny: "error",
          }
          return (
            <NTag size="small" type={typeMap[row.effect] || "default"}>
              {$t(`page.manage.fieldPolicy.effectOptions.${row.effect}` as any)}
            </NTag>
          )
        },
      },
      {
        key: "actions",
        title: $t("page.manage.fieldPolicy.actions"),
        width: 120,
        render: (row) => (
          <div class="flex flex-wrap gap-4px">
            {(row.actions || []).map((a: string) => (
              <NTag size="small">{$t(`page.manage.fieldPolicy.actionOptions.${a}` as any)}</NTag>
            ))}
          </div>
        ),
      },
      {
        key: "status",
        title: $t("page.manage.fieldPolicy.status"),
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
        title: $t("page.manage.fieldPolicy.createTime"),
        width: 180,
      },
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 130,
        render: (row) => (
          <div class="flex-center gap-8px">
            {hasAuth("manage_field-policy:edit") && (
              <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
                {$t("common.edit")}
              </NButton>
            )}
            {hasAuth("manage_field-policy:delete") && (
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
    onDeleted,
    onBatchDeleted,
  } = useTableOperate(data, "id", getData)

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteFieldPolicy(id)
    if (error) return
    onDeleted()
  }

  async function handleBatchDelete() {
    const { error } = await fetchBatchDeleteFieldPolicies(checkedRowKeys.value as string[])
    if (error) return
    onBatchDeleted()
  }

  function edit(id: string) {
    handleEdit(id)
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard
      :title="$t('page.manage.fieldPolicy.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation
          v-model:columns="columnChecks"
          :disabled-delete="checkedRowKeys.length === 0"
          :loading="loading"
          @refresh="getData"
          @delete="handleBatchDelete"
        >
          <NButton v-if="hasAuth('manage_field-policy:add')" size="small" ghost type="primary" @click="handleAdd">
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
        :scroll-x="1100"
        :loading="loading"
        remote
        :row-key="(row) => row.id"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
    </NCard>

    <FieldPolicyOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      @submitted="getDataByPage"
    />
  </div>
</template>
