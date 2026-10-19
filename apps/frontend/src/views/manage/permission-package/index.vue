<script setup lang="tsx">
  import { reactive } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
  import { fetchDeletePermissionPackage, fetchGetPermissionPackageList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { createPackageActionModel } from "./modules/package-actions"
  import PackageOperateDrawer from "./modules/package-operate-drawer.vue"

  defineOptions({ name: "ManagePermissionPackage" })

  const appStore = useAppStore()
  const { hasAuth, getActionContext } = useAuth()

  const actions = useTableActions(() => createPackageActionModel<Api.PermissionPackage.Package>(), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)

  const searchParams: Api.PermissionPackage.SearchParams = reactive({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: undefined,
  })

  const { columns, columnChecks, scrollX, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetPermissionPackageList(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page
      searchParams.pageSize = params.pageSize
    },
    columns: () => [
      {
        key: "index",
        title: $t("common.index"),
        width: 64,
        align: "center",
        render: (_, index) => index + 1,
      },
      {
        key: "label",
        title: $t("page.manage.permissionPackage.label"),
        minWidth: 160,
      },
      {
        key: "key",
        title: $t("page.manage.permissionPackage.key"),
        minWidth: 180,
      },
      {
        key: "codes",
        title: $t("page.manage.permissionPackage.codes"),
        minWidth: 240,
        render: (row) => {
          const shown = row.codes.slice(0, 3)
          const extra = row.codes.length - shown.length
          return (
            <div class="flex flex-wrap gap-4px">
              {shown.map((code) => (
                <NTag size="small" type="info">
                  {code}
                </NTag>
              ))}
              {extra > 0 && <NTag size="small">+{extra}</NTag>}
            </div>
          )
        },
      },
      {
        key: "builtin",
        title: $t("page.manage.permissionPackage.type"),
        width: 100,
        align: "center",
        render: (row) => (
          <NTag size="small" type={row.builtin ? "default" : "success"}>
            {row.builtin ? $t("page.manage.permissionPackage.builtin") : $t("page.manage.permissionPackage.custom")}
          </NTag>
        ),
      },
      {
        key: "description",
        title: $t("page.manage.permissionPackage.description"),
        minWidth: 160,
      },
      ...actions.column({
        key: "operate",
        title: $t("common.operate"),
        render: (row) => (
          <div class="flex items-center justify-start flex-nowrap gap-8px whitespace-nowrap">
            {actions.visible(row, "detail") ? (
              <NButton size="small" ghost onClick={() => handleEdit(row.id)}>
                {$t("common.detail")}
              </NButton>
            ) : (
              <NButton type="primary" ghost size="small" onClick={() => handleEdit(row.id)}>
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

  const { drawerVisible, operateType, editingData, handleAdd, handleEdit, onDeleted } = useTableOperate(
    data,
    "id",
    getData,
  )

  async function handleDelete(id: string) {
    const { error } = await fetchDeletePermissionPackage(id)
    if (error) return
    onDeleted()
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard
      :title="$t('page.manage.permissionPackage.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation
          :show-business-actions="hasAuth('permission-package:create')"
          v-model:columns="columnChecks"
          :loading="loading"
          @refresh="getData"
        >
          <template #prefix>
            <NInput
              v-model:value="searchParams.keyword"
              size="small"
              clearable
              class="w-200px"
              :placeholder="$t('page.manage.permissionPackage.label')"
              @keyup.enter="getDataByPage(1)"
              @clear="getDataByPage(1)"
            />
          </template>
          <NButton v-if="hasAuth('permission-package:create')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
        </TableHeaderOperation>
      </template>
      <NDataTable
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
    </NCard>

    <PackageOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      @submitted="getDataByPage"
    />
  </div>
</template>
