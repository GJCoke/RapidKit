<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { useBoolean } from "@rapidkit/hooks"
  import { defaultTransform, useNaivePaginatedTable } from "@/hooks/common/table"
  import { useAuth } from "@/hooks/business/auth"
  import { useAppStore } from "@/store/modules/app"
  import { fetchCancelAnnouncement, fetchDeleteAnnouncement, fetchGetAnnouncements, fetchPublishAnnouncement, fetchRecallAnnouncement } from "@/service/api"
  import { $t } from "@/locales"
  import AnnouncementOperateDrawer from "./modules/announcement-operate-drawer.vue"
  import AnnouncementSearch from "./modules/announcement-search.vue"

  defineOptions({ name: "NotificationAnnouncements" })

  const permissions = {
    create: "POST:/api/v1/admin/notifications",
    update: "PUT:/api/v1/admin/notifications/{message_id}",
    delete: "DELETE:/api/v1/admin/notifications/{message_id}",
    publish: "POST:/api/v1/admin/notifications/{message_id}/publish",
    cancel: "POST:/api/v1/admin/notifications/{message_id}/cancel",
    recall: "POST:/api/v1/admin/notifications/{message_id}/recall",
  }
  const { hasAuth } = useAuth()
  const appStore = useAppStore()
  const { bool: drawerVisible, setTrue: openDrawer } = useBoolean()
  const searchParams = reactive<Api.Notification.AnnouncementListQuery>({ page: 1, pageSize: 10 })
  const actingIds = ref<string[]>([])
  const selectedMessageId = ref<string | null>(null)
  const statusType: Record<Api.Notification.AnnouncementItem["status"], "default" | "info" | "success" | "warning" | "error"> = {
    draft: "default", scheduled: "info", publishing: "info", published: "success", expired: "default", cancelled: "error", recalled: "warning",
  }

  type AnnouncementListResponse = Awaited<ReturnType<typeof fetchGetAnnouncements>>

  const table = useNaivePaginatedTable<AnnouncementListResponse, Api.Notification.AnnouncementItem>({
    api: () => fetchGetAnnouncements(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: ({ page, pageSize }) => {
      Object.assign(searchParams, { page, pageSize })
    },
    columns: () => [
      { key: "title", title: $t("page.notification.manage.announcements.title" as I18nFullKey), minWidth: 180, ellipsis: { tooltip: true } },
      { key: "category", title: $t("page.notification.manage.announcements.category" as I18nFullKey), minWidth: 150 },
      { key: "status", title: $t("page.notification.manage.announcements.status" as I18nFullKey), width: 110, align: "center", render: (row) => <NTag type={statusType[row.status]} size="small">{$t(`page.notification.manage.announcements.statusOptions.${row.status}` as I18nFullKey)}</NTag> },
      { key: "publishAt", title: $t("page.notification.manage.announcements.publishAt" as I18nFullKey), minWidth: 170, render: (row) => row.publishAt ?? "-" },
      {
        key: "operate", title: $t("common.operate"), fixed: "right", width: 300, align: "center",
        render: (row) => <div class="flex-center gap-8px">
          {hasAuth(permissions.update) && ["draft", "scheduled"].includes(row.status) && <NButton ghost size="small" onClick={() => edit(row.id)}>{$t("common.edit")}</NButton>}
          {hasAuth(permissions.publish) && ["draft", "scheduled"].includes(row.status) && <NButton ghost size="small" type="primary" loading={actingIds.value.includes(row.id)} onClick={() => act(row.id, () => fetchPublishAnnouncement(row.id))}>{$t("page.notification.manage.announcements.publish" as I18nFullKey)}</NButton>}
          {hasAuth(permissions.delete) && ["draft", "scheduled"].includes(row.status) && <NPopconfirm onPositiveClick={() => act(row.id, () => fetchDeleteAnnouncement(row.id))}>{{ default: () => $t("common.confirm"), trigger: () => <NButton ghost size="small" type="error">{$t("page.notification.delete" as I18nFullKey)}</NButton> }}</NPopconfirm>}
          {hasAuth(permissions.cancel) && ["draft", "scheduled"].includes(row.status) && <NPopconfirm onPositiveClick={() => act(row.id, () => fetchCancelAnnouncement(row.id))}>{{ default: () => $t("common.confirm"), trigger: () => <NButton ghost size="small" type="error" disabled={actingIds.value.includes(row.id)}>{$t("page.notification.manage.announcements.cancel" as I18nFullKey)}</NButton> }}</NPopconfirm>}
          {hasAuth(permissions.recall) && row.status === "published" && <NPopconfirm onPositiveClick={() => act(row.id, () => fetchRecallAnnouncement(row.id))}>{{ default: () => $t("common.confirm"), trigger: () => <NButton ghost size="small" type="warning" disabled={actingIds.value.includes(row.id)}>{$t("page.notification.manage.announcements.recall" as I18nFullKey)}</NButton> }}</NPopconfirm>}
        </div>,
      },
    ],
  })

  async function act(id: string, request: () => Promise<{ error: unknown }>) {
    if (actingIds.value.includes(id)) return
    actingIds.value = [...actingIds.value, id]
    try {
      const { error } = await request()
      if (!error) await table.getData()
    } finally {
      actingIds.value = actingIds.value.filter((value) => value !== id)
    }
  }

  function edit(id: string) {
    selectedMessageId.value = id
    openDrawer()
  }

  function create() {
    selectedMessageId.value = null
    openDrawer()
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <AnnouncementSearch v-model:model="searchParams" @search="table.getDataByPage(1)" />
    <NCard
      :title="$t('page.notification.manage.announcements.pageTitle' as I18nFullKey)"
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
          <NButton v-if="hasAuth(permissions.create)" size="small" ghost type="primary" @click="create">
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
        :scroll-x="920"
        class="sm:h-full"
        :flex-height="!appStore.isMobile"
      />
      <AnnouncementOperateDrawer
        v-model:visible="drawerVisible"
        :message-id="selectedMessageId"
        @submitted="table.getDataByPage(1)"
      />
    </NCard>
  </div>
</template>
