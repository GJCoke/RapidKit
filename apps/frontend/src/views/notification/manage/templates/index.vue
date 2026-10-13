<script setup lang="tsx">
  import { computed, reactive, ref, watch } from "vue"
  import { useMediaQuery } from "@vueuse/core"
  import { NTag } from "naive-ui"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { useAuth } from "@/hooks/business/auth"
  import { useAppStore } from "@/store/modules/app"
  import { fetchDeleteNotificationTemplate, fetchGetNotificationTemplates } from "@/service/api"
  import { $t } from "@/locales"
  import SvgIcon from "@/components/custom/svg-icon.vue"
  import TemplateOperateDrawer from "./modules/template-operate-drawer.vue"
  import TemplateSearch from "./modules/template-search.vue"
  import TemplateDetailPanel from "./modules/template-detail-panel.vue"
  import TemplateStatus from "./modules/template-status.vue"
  import { templateCategoryLabel, templateListText as t, templateModeLabel } from "./modules/template-presentation"

  defineOptions({ name: "NotificationTemplates" })

  const permissions = {
    create: "POST:/api/v1/admin/notification-templates",
    update: "PUT:/api/v1/admin/notification-templates/{template_id}",
    delete: "DELETE:/api/v1/admin/notification-templates/{template_id}",
  }
  const { hasAuth } = useAuth()
  const appStore = useAppStore()
  const wideScreen = useMediaQuery("(min-width: 1200px)")
  const searchParams = reactive<Api.Notification.TemplateListQuery>({ page: 1, pageSize: 10 })
  const selectedId = ref<string | null>(null)
  const deletingId = ref<string | null>(null)
  const deleteTarget = ref<Api.Notification.Template | null>(null)
  const deleteConfirmVisible = ref(false)

  type TemplateListResponse = Awaited<ReturnType<typeof fetchGetNotificationTemplates>>

  const table = useNaivePaginatedTable<TemplateListResponse, Api.Notification.Template>({
    api: () => fetchGetNotificationTemplates(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: ({ page, pageSize }) => {
      Object.assign(searchParams, { page, pageSize })
    },
    columns: () => [
      {
        key: "name", title: t("name"), minWidth: 210,
        render: (row) => <div class="min-w-0 py-7px">
          <div class="truncate text-14px font-600 text-base-text-1" title={row.name}>{row.name}</div>
          <div class="mt-5px truncate font-mono text-12px text-base-text-3" title={row.code}>{row.code}</div>
        </div>,
      },
      {
        key: "category", title: t("categoryLevel"), width: 140,
        render: (row) => <div class="flex-col-stretch items-start gap-5px py-7px">
          <span class="max-w-full truncate text-13px text-base-text-2" title={row.category}>{templateCategoryLabel(row.category)}</span>
          <NTag type={row.level} size="tiny" bordered={false}>{$t(`page.notification.level.${row.level}` as I18nFullKey)}</NTag>
        </div>,
      },
      { key: "contentMode", title: $t("page.notification.manage.templates.mode" as I18nFullKey), width: 108, render: (row) => <span class="text-13px">{templateModeLabel(row.contentMode)}</span> },
      { key: "enabled", title: t("status"), width: 100, render: (row) => <TemplateStatus enabled={row.enabled} /> },
      {
        key: "detail", title: "", width: 36,
        render: () => <SvgIcon icon="carbon:chevron-right" class="text-16px text-base-text-3" aria-hidden="true" />,
      },
    ],
    getColumnVisible: (column) => !("key" in column && column.key === "detail"),
  })
  const operate = useTableOperate(table.data, "id", table.getData)
  const scrollX = computed(() => table.columns.value.reduce((width, column) => width + Number(column.width ?? column.minWidth ?? 120), 0))
  const selectedTemplate = computed(() => table.data.value.find((row) => row.id === selectedId.value) ?? null)

  watch(table.data, (rows) => {
    if (!rows.some((row) => row.id === selectedId.value)) selectedId.value = rows[0]?.id ?? null
  }, { immediate: true })

  function rowProps(row: Api.Notification.Template) {
    return {
      tabindex: 0,
      "aria-label": t("select", { name: row.name }),
      "aria-selected": row.id === selectedId.value,
      "aria-controls": "template-details",
      onClick: () => { selectedId.value = row.id },
      onKeydown: (event: KeyboardEvent) => {
        if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return
        event.preventDefault()
        selectedId.value = row.id
      },
    }
  }

  function requestDelete(row: Api.Notification.Template) {
    if (!hasAuth(permissions.delete) || deletingId.value) return
    deleteTarget.value = row
    deleteConfirmVisible.value = true
  }

  async function confirmDelete() {
    const target = deleteTarget.value
    if (!target || deletingId.value || !hasAuth(permissions.delete)) return false
    deletingId.value = target.id
    try {
      const { error } = await fetchDeleteNotificationTemplate(target.id)
      if (error) return false
      deleteConfirmVisible.value = false
      deleteTarget.value = null
      await operate.onDeleted()
      return true
    } catch {
      window.$message?.error(t("deleteFailed"))
      return false
    } finally {
      deletingId.value = null
    }
  }

  function editTemplate(id: string) {
    if (hasAuth(permissions.update)) operate.handleEdit(id)
  }
</script>

<template>
  <div class="template-page min-h-500px flex-col-stretch gap-16px">
    <TemplateSearch :model="searchParams" @search="table.getDataByPage(1)" />
    <div class="template-workspace min-h-0 min-w-0 flex-1 gap-16px">
      <NCard
        :bordered="false"
        size="small"
        class="template-list card-wrapper min-w-0"
        :content-style="{ display: 'flex', flexDirection: 'column', minHeight: 0 }"
      >
        <template #header>
          <div>
            <h1 class="m-0 text-18px font-600 text-base-text-1">
              {{ $t("page.notification.manage.templates.title" as I18nFullKey) }}
            </h1>
            <p class="m-0 mt-5px text-12px font-400 leading-20px text-base-text-3">{{ t("intro") }}</p>
          </div>
        </template>
        <template #header-extra>
          <TableHeaderOperation
            v-model:columns="table.columnChecks.value"
            :loading="table.loading.value"
            @refresh="table.getData"
          >
            <NButton v-if="hasAuth(permissions.create)" size="small" type="primary" @click="operate.handleAdd">
              <template #icon><SvgIcon icon="carbon:add" /></template>
              {{ $t("page.notification.manage.templates.add" as I18nFullKey) }}
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
          :row-props="rowProps"
          :row-class-name="(row) => (row.id === selectedId ? 'template-row-selected' : '')"
          :scroll-x="scrollX"
          class="template-table min-h-260px flex-1"
          :flex-height="wideScreen && !appStore.isMobile"
        />
      </NCard>
      <NCard :bordered="false" size="small" class="template-detail card-wrapper min-w-0">
        <TemplateDetailPanel
          :template="selectedTemplate"
          :can-edit="hasAuth(permissions.update)"
          :can-delete="hasAuth(permissions.delete)"
          :deleting="Boolean(deletingId)"
          @edit="editTemplate"
          @delete="requestDelete"
        />
      </NCard>
    </div>
    <TemplateOperateDrawer
      v-model:visible="operate.drawerVisible.value"
      :operate-type="operate.operateType.value"
      :row-data="operate.editingData.value"
      @submitted="table.getData"
    />
    <NModal
      v-model:show="deleteConfirmVisible"
      preset="dialog"
      type="warning"
      :title="t('deleteTitle')"
      :content="deleteTarget ? t('deleteContent', { name: deleteTarget.name, code: deleteTarget.code }) : ''"
      :positive-text="$t('common.delete')"
      :negative-text="$t('common.cancel')"
      :positive-button-props="{ type: 'error', loading: Boolean(deletingId), disabled: Boolean(deletingId) }"
      :negative-button-props="{ disabled: Boolean(deletingId) }"
      :closable="!deletingId"
      :mask-closable="!deletingId"
      :close-on-esc="!deletingId"
      @positive-click="confirmDelete"
    />
  </div>
</template>

<style scoped>
  .template-page {
    overflow: auto;
  }
  .template-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
  .template-table :deep(.n-data-table-tr) {
    cursor: pointer;
  }
  .template-table :deep(.n-data-table-tr:focus-visible) {
    outline: 2px solid rgb(var(--primary-color));
    outline-offset: -2px;
  }
  .template-table :deep(.template-row-selected td) {
    background-color: rgb(var(--primary-color) / 0.06);
  }
  .template-table :deep(.template-row-selected td:first-child) {
    box-shadow: inset 3px 0 0 rgb(var(--primary-color));
  }
  .template-table :deep(.n-data-table-th) {
    font-size: 13px;
  }
  .template-detail :deep(.n-card__content) {
    padding: 20px;
  }
  .template-list :deep(.n-card-header) {
    flex-wrap: wrap;
    gap: 12px;
  }
  @media (min-width: 1200px) {
    .template-page {
      overflow: hidden;
    }
    .template-workspace {
      grid-template-columns: minmax(0, 1.65fr) minmax(360px, 1fr);
      align-items: stretch;
      overflow: hidden;
    }
    .template-list {
      min-height: 0;
    }
    .template-detail {
      min-height: 0;
      overflow: auto;
    }
  }
  @media (max-width: 639px) {
    .template-detail :deep(.n-card__content) {
      padding: 16px;
    }
    .template-list :deep(.n-card-header__extra) {
      width: 100%;
    }
    .template-list :deep(.n-card-header__extra > .n-space) {
      width: 100%;
    }
  }
</style>
