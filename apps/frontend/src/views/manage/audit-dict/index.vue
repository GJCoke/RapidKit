<script setup lang="tsx">
  import { computed, ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { fetchDeleteAuditDict, fetchGetAuditDictList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import AuditDictOperateDrawer from "./modules/audit-dict-operate-drawer.vue"
  import AuditDictSearch from "./modules/audit-dict-search.vue"

  defineOptions({ name: "ManageAuditDict" })

  const appStore = useAppStore()
  const { hasAuth } = useAuth()

  const searchParams = ref<{ category?: string }>({ category: undefined })
  const allData = ref<Api.SystemManage.AuditDict[]>([])
  const loading = ref(false)

  const filteredData = computed(() => {
    if (!searchParams.value.category) return allData.value
    return allData.value.filter((item) => item.category === searchParams.value.category)
  })

  async function getData() {
    loading.value = true
    const { data, error } = await fetchGetAuditDictList()
    if (!error) {
      allData.value = data
    }
    loading.value = false
  }

  getData()

  const columns = [
    {
      key: "index",
      title: $t("common.index"),
      width: 64,
      align: "center" as const,
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "key",
      title: $t("page.manage.auditDict.key"),
      minWidth: 120,
    },
    {
      key: "category",
      title: $t("page.manage.auditDict.category"),
      width: 100,
      align: "center" as const,
      render: (row: Api.SystemManage.AuditDict) => {
        const map: Record<string, { label: string; type: NaiveUI.ThemeColor }> = {
          resource: { label: $t("page.manage.auditDict.categoryResource"), type: "info" },
          action: { label: $t("page.manage.auditDict.categoryAction"), type: "success" },
        }
        const item = map[row.category]
        return item ? <NTag type={item.type} size="small">{item.label}</NTag> : row.category
      },
    },
    {
      key: "labelZh",
      title: $t("page.manage.auditDict.labelZh"),
      minWidth: 120,
    },
    {
      key: "labelEn",
      title: $t("page.manage.auditDict.labelEn"),
      minWidth: 120,
    },
    {
      key: "operate",
      title: $t("common.operate"),
      align: "center" as const,
      width: 130,
      render: (row: Api.SystemManage.AuditDict) => (
        <div class="flex-center gap-8px">
          {hasAuth("manage_audit-dict:edit") && (
            <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
              {$t("common.edit")}
            </NButton>
          )}
          {hasAuth("manage_audit-dict:delete") && (
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
  ]

  const {
    drawerVisible,
    operateType,
    editingData,
    handleAdd,
    handleEdit,
  } = useTableOperate(allData, "id", getData)

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteAuditDict(id)
    if (error) return
    window.$message?.success($t("common.deleteSuccess"))
    getData()
  }

  function edit(id: string) {
    handleEdit(id)
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <AuditDictSearch v-model:model="searchParams" @search="getData" />
    <NCard
      :title="$t('page.manage.auditDict.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation :loading="loading" @refresh="getData">
          <NButton v-if="hasAuth('manage_audit-dict:add')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
        </TableHeaderOperation>
      </template>
      <NDataTable
        :columns="columns"
        :data="filteredData"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="600"
        :loading="loading"
        :row-key="(row: Api.SystemManage.AuditDict) => row.id"
        class="sm:h-full"
      />
      <AuditDictOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getData"
      />
    </NCard>
  </div>
</template>
