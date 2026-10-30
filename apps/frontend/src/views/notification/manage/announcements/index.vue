<script setup lang="tsx">
  import { computed, reactive, ref, onActivated, onDeactivated, onMounted, onUnmounted, watch } from "vue"
  import { useDocumentVisibility } from "@vueuse/core"
  import { formatApiTime } from "@/utils/datetime"
  import { useBoolean } from "@rapidkit/hooks"
  import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
  import { useBannerStore } from "@/store/modules/banner"
  import NotificationLevel from "@/components/notification/notification-level.vue"
  import { defaultTransform, useNaivePaginatedTable } from "@/hooks/common/table"
  import { useAuth } from "@/hooks/business/auth"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { useAppStore } from "@/store/modules/app"
  import { fetchCheckBanner, fetchCancelAnnouncement, fetchDeleteAnnouncement, fetchGetAnnouncements, fetchRecallAnnouncement } from "@/service/api"
  import { renderTitle } from "@/utils/notification/content-render"
  import { $t } from "@/locales"
  import BannerSummary from "./modules/banner-summary.vue"
  import AnnouncementDetail from "./modules/announcement-detail.vue"
  import AnnouncementTableCell from "./modules/announcement-table-cell.vue"
  import AnnouncementTableActions from "./modules/announcement-table-actions.vue"
  import { announcementPermissions as permissions, announcementActionLabel, announcementTableText as tt } from "./modules/announcement-table"
  import type { AnnouncementAction } from "./modules/announcement-table"
  import { createAnnouncementActionModel } from "./modules/announcement-table"
  import AnnouncementOperateDrawer from "./modules/announcement-operate-drawer.vue"
  import AnnouncementSearch from "./modules/announcement-search.vue"

  defineOptions({ name: "NotificationAnnouncements" })

  const { hasAuth, getActionContext } = useAuth()
  const appStore = useAppStore()
  const actions = useTableActions(createAnnouncementActionModel, () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)
  const { bool: drawerVisible, setTrue: openDrawer } = useBoolean()
  const searchParams = reactive<Api.Notification.AnnouncementListQuery>({ page: 1, pageSize: DEFAULT_PAGE_SIZE, status: undefined, category: undefined, displayMode: undefined })
  const bannerStore = useBannerStore()
  const bannerCheck = ref<Api.Notification.BannerCheck | null>(null)
  const bannerFailed = ref(false)
  const bannerLoading = ref(false)
  const detailVisible = ref(false)
  const detailId = ref<string | null>(null)
  const documentVisibility = useDocumentVisibility()
  const pageActive = ref(true)
  const summaryActive = computed(() => pageActive.value && documentVisibility.value !== "hidden" && hasAuth("notification:preview"))
  let summaryPromise: Promise<void> | null = null
  let fullRefresh: Promise<void> | null = null
  let disposed = false
  let lastSummaryAt = -Infinity
  const bt = (key: string) => $t(`page.notification.banner.${key}` as I18nFullKey)
  function loadBanners(): Promise<void> {
    if (disposed || !summaryActive.value) return Promise.resolve()
    if (summaryPromise) return summaryPromise
    const requestedRevision = bannerStore.snapshot?.revision ?? 0
    lastSummaryAt = performance.now()
    bannerLoading.value = true
    summaryPromise = (async () => {
      try {
        const { data, error } = await fetchCheckBanner()
        if (disposed || !summaryActive.value) return
        const requiredRevision = bannerStore.snapshot?.revision ?? 0
        bannerFailed.value = Boolean(error || !data || data.revision < requiredRevision)
        if (!bannerFailed.value && data) bannerCheck.value = data
      } catch {
        if (!disposed) bannerFailed.value = true
      } finally {
        if (!disposed) {
          bannerLoading.value = false
          summaryPromise = null
          const requiredRevision = bannerStore.snapshot?.revision ?? 0
          if (!fullRefresh && requiredRevision > requestedRevision && (bannerCheck.value?.revision ?? -1) < requiredRevision)
            void loadBanners()
        }
      }
    })()
    return summaryPromise
  }
  function onFocus() {
    if (!fullRefresh && performance.now() - lastSummaryAt >= 30000) void loadBanners()
  }
  onMounted(() => { void loadBanners(); window.addEventListener("focus", onFocus) })
  onActivated(() => { pageActive.value = true })
  onDeactivated(() => { pageActive.value = false })
  onUnmounted(() => { disposed = true; window.removeEventListener("focus", onFocus) })
  watch(summaryActive, (active) => { if (active && !fullRefresh) void loadBanners() })
  watch(() => bannerStore.snapshot?.revision, (revision) => {
    if (!fullRefresh && revision !== undefined && revision > (bannerCheck.value?.revision ?? -1)) void loadBanners()
  })
  function showDetails(id: string) { detailId.value = id; detailVisible.value = true }
  function upcomingHint() {
    const scheduled = bannerCheck.value?.scheduled
    return scheduled ? `${bt("takeDownUpcoming")} ${renderTitle(scheduled)} · ${formatApiTime(scheduled.publishAt, undefined, "YYYY-MM-DD HH:mm")}` : ""
  }
  function recallHint(row: Api.Notification.AnnouncementItem) { return row.displayMode === "top_banner" ? `${bt("takeDownWarning")} ${upcomingHint()}` : tt("recallWarning") }
  function refreshAll(): Promise<void> {
    const rows = table.getData()
    if (fullRefresh) return Promise.all([rows, fullRefresh]).then(() => {})
    const pending = summaryPromise
    fullRefresh = (async () => {
      try {
        await Promise.all([rows, bannerStore.refresh()])
        await pending
        if (!pending || bannerFailed.value || (bannerCheck.value?.revision ?? -1) < (bannerStore.snapshot?.revision ?? 0))
          await loadBanners()
      } finally {
        fullRefresh = null
        if (!disposed && (bannerCheck.value?.revision ?? -1) < (bannerStore.snapshot?.revision ?? 0)) void loadBanners()
      }
    })()
    return fullRefresh
  }
  const actingIds = ref<string[]>([])
  const copyFromId = ref<string | null>(null)
  const selectedMessageId = ref<string | null>(null)

  type AnnouncementListResponse = Awaited<ReturnType<typeof fetchGetAnnouncements>>

  const table = useNaivePaginatedTable<AnnouncementListResponse, Api.Notification.AnnouncementItem>({
    api: () => fetchGetAnnouncements(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: ({ page, pageSize }) => {
      Object.assign(searchParams, { page, pageSize })
    },
    columns: () => [
      { key: "title", title: tt("information"), minWidth: 360, render: (row) => <AnnouncementTableCell row={row} kind="content" onDetail={() => showDetails(row.id)} /> },
      { key: "displayMode", title: bt("displayMode"), width: 140, render: (row) => <AnnouncementTableCell row={row} kind="display" /> },
      { key: "level", title: bt("level"), width: 100, render: (row) => <NotificationLevel level={row.level} /> },
      { key: "status", title: $t("page.notification.manage.announcements.status" as I18nFullKey), width: 110, render: (row) => <AnnouncementTableCell row={row} kind="status" /> },
      { key: "publishAt", title: tt("time"), width: 220, render: (row) => <AnnouncementTableCell row={row} kind="time" /> },
      ...actions.column({ key: "operate", title: $t("common.operate"), fixed: "right",
        render: (row) => <AnnouncementTableActions row={row} busy={actingIds.value.includes(row.id)} onAction={(action) => handleAction(row, action)} /> }),
    ],
  })

  const pendingAction = ref<{ id: string; action: AnnouncementAction } | null>(null)
  let closePendingDialog: (() => void) | undefined
  let dialogVersion = 0
  watch(() => {
    if (!pendingAction.value) return true
    const row = table.data.value.find((item) => item.id === pendingAction.value!.id)
    return Boolean(row && actions.enabled(row, pendingAction.value.action))
  }, (allowed) => { if (!allowed) closePendingDialog?.() })
  onUnmounted(() => closePendingDialog?.())

  function handleAction(row: Api.Notification.AnnouncementItem, action: AnnouncementAction) {
    if (actingIds.value.includes(row.id) || !actions.enabled(row, action)) return
    if (action === "detail") return showDetails(row.id)
    if (action === "edit" || action === "publish") return edit(row.id)
    if (action === "copy") return copy(row.id)
    const warning = action === "recall" ? recallHint(row)
      : action === "delete" ? tt(row.status === "draft" ? "deleteDraftWarning" : "deletePlanWarning")
      : row.displayMode === "top_banner" && row.status === "scheduled" ? bt("cancelWarning")
      : tt(row.status === "draft" ? "cancelDraftWarning" : "cancelPlanWarning")
    closePendingDialog?.()
    pendingAction.value = { id: row.id, action }
    const version = ++dialogVersion
    const dialog = window.$dialog?.warning({
      onAfterLeave: () => { if (version === dialogVersion) pendingAction.value = null },
      title: announcementActionLabel(row, action),
      content: warning,
      positiveText: announcementActionLabel(row, action),
      negativeText: $t("common.cancel"),
      onPositiveClick: () => actions.run(
        () => table.data.value.find((item) => item.id === row.id), action,
        (latest) => act(latest.id, () => action === "delete" ? fetchDeleteAnnouncement(latest.id)
          : action === "cancel" ? fetchCancelAnnouncement(latest.id) : fetchRecallAnnouncement(latest.id)),
      ),
    })
    closePendingDialog = () => dialog?.destroy()
  }

  async function act(id: string, request: () => Promise<{ error: unknown }>) {
    if (actingIds.value.includes(id)) return false
    actingIds.value = [...actingIds.value, id]
    try {
      const { error } = await request()
      if (!error) await refreshAll()
      return !error
    } finally {
      actingIds.value = actingIds.value.filter((value) => value !== id)
    }
  }

  function edit(id: string) {
    copyFromId.value = null
    selectedMessageId.value = id
    openDrawer()
  }

  function copy(id: string) { selectedMessageId.value = null; copyFromId.value = id; openDrawer() }

  function create() {
    copyFromId.value = null
    selectedMessageId.value = null
    openDrawer()
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <AnnouncementSearch :model="searchParams" @search="table.getDataByPage(1)" />
    <NCard
      v-if="hasAuth('notification:preview')"
      :bordered="false"
      size="small"
      class="card-wrapper shrink-0"
      :title="bt('topBanner')"
    >
      <template #header-extra>
        <NButton size="small" :disabled="bannerLoading" :aria-busy="bannerLoading" @click="loadBanners">
          <template #icon>
            <SvgIcon icon="carbon:renew" :class="{ 'animate-spin': bannerLoading }" aria-hidden="true" />
          </template>
          {{ bt("refresh") }}
        </NButton>
      </template>
      <NAlert v-if="bannerFailed" type="warning">{{ bt("summaryFailed") }}</NAlert>
      <BannerSummary v-if="bannerCheck" :check="bannerCheck">
        <template #current="{ item }">
          <NButton size="small" @click="showDetails(item.id)">{{ bt("viewDetails") }}</NButton>
          <NPopconfirm
            v-if="hasAuth(permissions.recall)"
            @positive-click="act(item.id, () => fetchRecallAnnouncement(item.id))"
            ><template #trigger
              ><NButton size="small" ghost type="warning" :loading="actingIds.includes(item.id)">{{
                bt("takeDown")
              }}</NButton></template
            >{{ bt("takeDownWarning") }} {{ upcomingHint() }}</NPopconfirm
          ></template
        >
        <template #scheduled="{ item }">
          <NButton size="small" @click="showDetails(item.id)">{{ bt("viewDetails") }}</NButton>
          <NButton v-if="hasAuth(permissions.update)" size="small" ghost @click="edit(item.id)">{{
            $t("common.edit")
          }}</NButton
          ><NPopconfirm
            v-if="hasAuth(permissions.cancel)"
            @positive-click="act(item.id, () => fetchCancelAnnouncement(item.id))"
            ><template #trigger
              ><NButton size="small" ghost type="error" :loading="actingIds.includes(item.id)">{{
                bt("cancelPlan")
              }}</NButton></template
            >{{ bt("cancelWarning") }}</NPopconfirm
          ></template
        >
      </BannerSummary>
    </NCard>
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
          @refresh="refreshAll"
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
        table-layout="fixed"
        :loading="table.loading.value"
        remote
        :pagination="table.mobilePagination.value"
        :row-key="(row) => row.id"
        :scroll-x="table.scrollX.value"
        class="announcement-table sm:h-full"
        :flex-height="!appStore.isMobile"
      />
      <AnnouncementOperateDrawer
        v-model:visible="drawerVisible"
        :message-id="selectedMessageId"
        :copy-from-id="copyFromId"
        @submitted="refreshAll"
      />
    </NCard>
    <AnnouncementDetail v-model:visible="detailVisible" :message-id="detailId" />
  </div>
</template>
