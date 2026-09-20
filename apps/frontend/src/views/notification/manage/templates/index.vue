<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import { NButton, NPopconfirm, NSwitch, NTag } from "naive-ui"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { useAuth } from "@/hooks/business/auth"
  import { useAppStore } from "@/store/modules/app"
  import { fetchDeleteNotificationTemplate, fetchGetNotificationTemplates } from "@/service/api"
  import { $t } from "@/locales"
  import TemplateOperateDrawer from "./modules/template-operate-drawer.vue"
  import TemplateSearch from "./modules/template-search.vue"

  defineOptions({ name: "NotificationTemplates" })

  const permissions = {
    create: "POST:/api/v1/admin/notification-templates",
    update: "PUT:/api/v1/admin/notification-templates/{template_id}",
    delete: "DELETE:/api/v1/admin/notification-templates/{template_id}",
  }
  const { hasAuth } = useAuth()
  const appStore = useAppStore()
  const searchParams = reactive<Api.Notification.TemplateListQuery>({ page: 1, pageSize: 10 })
  const deletingId = ref<string | null>(null)

  type TemplateListResponse = Awaited<ReturnType<typeof fetchGetNotificationTemplates>>

  const table = useNaivePaginatedTable<TemplateListResponse, Api.Notification.Template>({
    api: () => fetchGetNotificationTemplates(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: ({ page, pageSize }) => {
      Object.assign(searchParams, { page, pageSize })
    },
    columns: () => [
      { key: "code", title: $t("page.notification.manage.templates.code" as I18nFullKey), minWidth: 150 },
      { key: "name", title: $t("page.notification.manage.templates.name" as I18nFullKey), minWidth: 130 },
      { key: "category", title: $t("page.notification.manage.templates.category" as I18nFullKey), minWidth: 150 },
      { key: "level", title: $t("page.notification.manage.templates.level" as I18nFullKey), width: 90, render: (row) => <NTag type={row.level} size="small">{$t(`page.notification.level.${row.level}` as I18nFullKey)}</NTag> },
      { key: "contentMode", title: $t("page.notification.manage.templates.mode" as I18nFullKey), width: 100, render: (row) => <NTag size="small">{$t(`page.notification.manage.templates.modeOptions.${row.contentMode}` as I18nFullKey)}</NTag> },
      { key: "enabled", title: $t("page.notification.manage.templates.enabled" as I18nFullKey), width: 80, align: "center", render: (row) => <NSwitch value={row.enabled} disabled size="small" /> },
      {
        key: "operate", title: $t("common.operate"), width: 150, align: "center", fixed: "right",
        render: (row) => <div class="flex-center gap-8px">
          {hasAuth(permissions.update) && <NButton ghost size="small" type="primary" onClick={() => operate.handleEdit(row.id)}>{$t("common.edit")}</NButton>}
          {hasAuth(permissions.delete) && <NPopconfirm onPositiveClick={() => handleDelete(row.id)}>{{ default: () => $t("common.confirmDelete"), trigger: () => <NButton ghost size="small" type="error" loading={deletingId.value === row.id}>{$t("common.delete")}</NButton> }}</NPopconfirm>}
        </div>,
      },
    ],
  })
  const operate = useTableOperate(table.data, "id", table.getData)

  async function handleDelete(id: string) {
    if (deletingId.value) return
    deletingId.value = id
    try {
      const { error } = await fetchDeleteNotificationTemplate(id)
      if (!error) await operate.onDeleted()
    } finally {
      deletingId.value = null
    }
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <TemplateSearch v-model:model="searchParams" @search="table.getDataByPage(1)" />
    <NCard
      :title="$t('page.notification.manage.templates.title' as I18nFullKey)"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation
          v-model:columns="table.columnChecks.value"
          :loading="table.loading.value"
          @refresh="table.getData"
        >
          <NButton v-if="hasAuth(permissions.create)" size="small" ghost type="primary" @click="operate.handleAdd">
            <template #icon><icon-ic-round-plus class="text-icon" /></template>
            {{ $t("common.add") }}
          </NButton>
        </TableHeaderOperation>
      </template>
      <NDataTable
        :columns="table.columns.value"
        :data="table.data.value"
        size="small"
        :loading="table.loading.value"
        remote
        :pagination="table.mobilePagination.value"
        :row-key="(row) => row.id"
        :scroll-x="900"
        class="sm:h-full"
        :flex-height="!appStore.isMobile"
      />
      <TemplateOperateDrawer
        v-model:visible="operate.drawerVisible.value"
        :operate-type="operate.operateType.value"
        :row-data="operate.editingData.value"
        @submitted="table.getDataByPage(1)"
      />
    </NCard>
  </div>
</template>
