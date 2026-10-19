<script setup lang="tsx">
  import { computed, onMounted, onScopeDispose, ref } from "vue"
  import type { DataTableColumns } from "naive-ui"
  import { NButton } from "naive-ui"
  import { residentActionModel } from "@/hooks/business/table-actions/layout"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { tableScrollWidth } from "@/hooks/common/table-columns"
  import { PAGE_SIZE_OPTIONS } from "@/constants/pagination"
  import { useAuth } from "@/hooks/business/auth"
  import { useAppStore } from "@/store/modules/app"
  import { useRouteStore } from "@/store/modules/route"
  import { fetchGetAnnouncements } from "@/service/api"
  import { renderTitle } from "@/utils/notification/content-render"
  import { $t } from "@/locales"
  import { deliveryPermissions as permissions, isMessageId, useDeliveryWorkbench } from "./composables/use-delivery-workbench"
  import { deliveryStates, deliveryStateStyle, deliveryText as t, deliveryTime } from "./modules/delivery-presentation"
  import DeliveryStatus from "./modules/delivery-status.vue"
  import DeliveryResult from "./modules/delivery-result.vue"
  import DeliveryDetail from "./modules/delivery-detail.vue"
  import DeliveryRecipient from "./modules/delivery-recipient.vue"
  import DeliveryMessage from "./modules/delivery-message.vue"
  import AnnouncementDetail from "../announcements/modules/announcement-detail.vue"

  defineOptions({ name: "NotificationDeliveries" })
  const { hasAuth, getActionContext } = useAuth()
  const appStore = useAppStore()
  const routeStore = useRouteStore()
  // List access comes from this page's route; useAuth only contains button permissions.
  const state = useDeliveryWorkbench((permission) => permission === permissions.list || hasAuth(permission))
  const { messageId, summary, records, total, page, pageSize, status, loading, summaryLoading,
    summaryFailed, listFailed, updatedAt, retrying, failedCount, canRetry } = state
  const canReadMessages = computed(() => hasAuth(permissions.messages) ||
    routeStore.searchMenus.some((menu) => menu.routeKey === "notification_manage_announcements"))
  const messages = ref<Api.Notification.AnnouncementItem[]>([])
  const messagesLoading = ref(false)
  const messagesFailed = ref(false)
  const locateVisible = ref(false)
  const draftId = ref("")
  const detailVisible = ref(false)
  const detailRow = ref<Api.Notification.Delivery | null>(null)
  const messageDetailVisible = ref(false)
  const messageDetailId = ref<string | null>(null)
  let messagesRequest = 0
  const selectedMessage = computed(() => messages.value.find((item) => item.id === messageId.value))
  const currentMessage = computed<Api.Notification.DeliveryMessage | null>(() =>
    summary.value?.message ?? records.value.find((row) => row.messageId === messageId.value)?.message ?? selectedMessage.value ?? null)
  const messageTitle = (item: Api.Notification.AnnouncementItem) => renderTitle({ ...item, contentParams: null })
  const messageOptions = computed(() => messages.value.map((item) => ({
    value: item.id,
    label: `${messageTitle(item)} · ${deliveryTime(item.publishedAt || item.createTime)} · ${$t(`page.notification.manage.announcements.statusOptions.${item.status}` as I18nFullKey)}`,
  })))
  const queried = computed(() => Boolean(messageId.value))
  const busy = computed(() => loading.value || summaryLoading.value)
  const retryAllowed = computed(() => canRetry.value && (!currentMessage.value || (
    currentMessage.value.status === "published" &&
    (!currentMessage.value.expireAt || new Date(currentMessage.value.expireAt).getTime() > Date.now())
  )))
  const pagination = computed(() => ({
    page: page.value, pageSize: pageSize.value, itemCount: total.value,
    showSizePicker: true, pageSizes: [...PAGE_SIZE_OPTIONS],
    simple: appStore.isMobile,
    prefix: () => $t("page.notification.manage.deliveries.recordCount", { count: total.value }),
    onUpdatePage: (value: number) => state.setPage(value),
    onUpdatePageSize: (value: number) => state.setPageSize(value),
  }))
  const actions = useTableActions(() => residentActionModel<Api.Notification.Delivery>({ detail: t("details") }), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)
  const columns = computed<DataTableColumns<Api.Notification.Delivery>>(() => [
    { key: "recipient", title: t("recipient"), width: 250,
      render: (row) => <DeliveryRecipient recipient={row.recipient} userId={row.userId} /> },
    { key: "channel", title: t("channel"), width: 110, render: () => t("inApp") },
    { key: "status", title: t("deliveryStatus"), width: 120, render: (row) => <DeliveryStatus status={row.status} /> },
    { key: "attemptCount", title: t("attemptCount"), width: 100, render: (row) => row.attemptCount },
    { key: "result", title: t("latestResult"), minWidth: 240, render: (row) => <DeliveryResult row={row} /> },
    ...actions.column({ key: "action", title: $t("common.operate"), fixed: "right",
      render: (row) => <NButton text type="primary" size="small" onClick={() => showDetails(row)}>{t("details")}</NButton> }),
  ])

  const scrollX = computed(() => tableScrollWidth(columns.value))

  function showDetails(row: Api.Notification.Delivery) {
    detailRow.value = row
    detailVisible.value = true
  }

  function returnToWorkbench() {
    detailVisible.value = false
    void state.setStatus("dead")
  }

  function showMessageDetails(id: string) {
    if (!canReadMessages.value) return
    messageDetailId.value = id
    messageDetailVisible.value = true
  }

  async function selectMessage(id: string) {
    detailVisible.value = false
    detailRow.value = null
    messageDetailVisible.value = false
    draftId.value = id
    await state.selectMessage(id)
  }

  async function locate() {
    if (!isMessageId(draftId.value)) return
    locateVisible.value = false
    await selectMessage(draftId.value.trim())
  }

  async function loadMessages() {
    if (!canReadMessages.value) return
    const request = ++messagesRequest
    messagesLoading.value = true
    messagesFailed.value = false
    try {
      const { data, error } = await fetchGetAnnouncements({ page: 1, pageSize: 20, displayMode: "inbox" })
      if (request !== messagesRequest) return
      messagesFailed.value = Boolean(error || !data)
      if (!error && data) {
        messages.value = data.records
        if (!messageId.value && data.records[0]) await selectMessage(data.records[0].id)
      }
    } finally {
      if (request === messagesRequest) messagesLoading.value = false
    }
  }

  async function refresh() {
    detailVisible.value = false
    await Promise.all([state.refresh(), loadMessages()])
  }

  function confirmRetry() {
    if (!retryAllowed.value) return
    const id = messageId.value
    window.$dialog?.warning({
      title: t("retryTitle"),
      content: $t("page.notification.manage.deliveries.retryConfirm", { count: failedCount.value }),
      positiveText: t("confirmRetry"), negativeText: $t("common.cancel"),
      onPositiveClick: async () => {
        if (messageId.value !== id || !retryAllowed.value) return false
        const count = await state.retry()
        if (count === null) return false
        if (messageId.value === id) window.$message?.success($t("page.notification.manage.deliveries.retried", { count }))
        return true
      },
    })
  }

  onMounted(() => { void loadMessages() })
  onScopeDispose(() => { messagesRequest++ })
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px">
    <div class="flex flex-wrap items-center justify-between gap-12px">
      <div>
        <h2 class="m-0 text-20px font-600 text-base-text-1">{{ t("title") }}</h2>
        <p class="mb-0 mt-6px text-13px text-base-text-3">{{ t("subtitle") }}</p>
      </div>
      <NSpace>
        <NButton :loading="busy || messagesLoading" @click="refresh">
          <template #icon><SvgIcon icon="carbon:renew" /></template>{{ $t("common.refresh") }}
        </NButton>
        <NButton
          v-if="hasAuth(permissions.retry)"
          type="primary"
          :disabled="!retryAllowed"
          :loading="retrying"
          @click="confirmRetry"
        >
          {{ $t("page.notification.manage.deliveries.retryFailedCount", { count: failedCount }) }}
        </NButton>
      </NSpace>
    </div>

    <NCard :bordered="false" size="small" class="card-wrapper shrink-0">
      <div class="flex flex-wrap items-center gap-12px">
        <span v-if="canReadMessages" class="shrink-0 text-base-text-2">{{ t("selectMessage") }}</span>
        <NSelect
          v-if="canReadMessages"
          :value="messages.some((item) => item.id === messageId) ? messageId : null"
          :options="messageOptions"
          :loading="messagesLoading"
          filterable
          :placeholder="t('selectMessagePlaceholder')"
          :aria-label="t('selectMessage')"
          class="min-w-0 flex-1 basis-240px"
          @update:value="selectMessage"
        />
        <NButton
          :type="canReadMessages ? 'default' : 'primary'"
          :quaternary="canReadMessages"
          @click="locateVisible = !locateVisible"
        >
          <template #icon><SvgIcon icon="carbon:search-locate" /></template>{{ t("advancedQuery") }}
        </NButton>
      </div>
      <NAlert v-if="messagesFailed" class="mt-12px" type="warning" :show-icon="false">{{ t("messagesFailed") }}</NAlert>
      <div v-if="locateVisible || !canReadMessages" class="mt-12px flex flex-wrap items-start gap-8px">
        <div class="min-w-0 flex-1 basis-240px">
          <NInput
            v-model:value="draftId"
            clearable
            :aria-label="t('messageId')"
            :placeholder="t('messageIdPlaceholder')"
            :status="draftId && !isMessageId(draftId) ? 'error' : undefined"
            @keyup.enter="locate"
          />
          <p v-if="draftId && !isMessageId(draftId)" role="alert" class="mb-0 mt-6px text-12px text-error">
            {{ t("messageIdInvalid") }}
          </p>
        </div>
        <NButton type="primary" :disabled="!isMessageId(draftId)" :loading="busy" @click="locate">{{
          $t("common.search")
        }}</NButton>
      </div>
      <DeliveryMessage
        v-if="messageId"
        :message="currentMessage"
        :can-view="canReadMessages"
        class="mt-14px"
        @detail="showMessageDetails(messageId)"
      />
    </NCard>

    <template v-if="queried && hasAuth(permissions.summary)">
      <NAlert v-if="summaryFailed" type="warning" :show-icon="false">
        <div class="flex flex-wrap items-center justify-between gap-8px">
          {{ t("summaryFailed") }}<NButton size="small" @click="state.refresh">{{ $t("common.refresh") }}</NButton>
        </div>
      </NAlert>
      <NSpin v-else :show="summaryLoading">
        <div class="grid grid-cols-2 gap-12px sm:grid-cols-3 xl:grid-cols-6" :aria-label="t('resultTitle')">
          <button
            v-for="item in deliveryStates"
            :key="item"
            type="button"
            class="delivery-stat w-full border border-transparent rd-8px bg-container px-16px py-12px text-left shadow-sm transition-colors focus-visible:outline-theme-primary"
            :class="{ 'delivery-stat-selected': status === item }"
            :aria-pressed="status === item"
            :disabled="summaryLoading || !summary"
            @click="state.setStatus(status === item ? null : item)"
          >
            <span class="flex-y-center gap-6px text-13px text-base-text-2"
              ><SvgIcon :icon="deliveryStateStyle[item].icon" aria-hidden="true" />{{ t(`status.${item}`) }}</span
            >
            <span class="mt-6px block text-24px font-600 tabular-nums" :class="deliveryStateStyle[item].color">{{
              summary ? (summary.byStatus?.[item] ?? 0) : "—"
            }}</span>
          </button>
        </div>
      </NSpin>
    </template>

    <NCard :bordered="false" size="small" class="card-wrapper" :title="t('recordsTitle')">
      <template #header-extra>
        <div class="flex flex-wrap items-center justify-end gap-8px">
          <NTag v-if="queried" size="small" :bordered="false">{{
            status ? t(`status.${status}`) : t("allStatuses")
          }}</NTag>
          <NButton v-if="status" text type="primary" size="small" @click="state.setStatus(null)">{{
            t("clearFilter")
          }}</NButton>
          <span v-if="updatedAt && !listFailed" class="text-12px text-base-text-3 lt-sm:hidden"
            >{{ t("updatedAt") }} {{ deliveryTime(updatedAt) }}</span
          >
        </div>
      </template>
      <NEmpty v-if="!queried" class="py-56px" :description="t('empty')" />
      <NAlert v-else-if="listFailed" type="error">
        <div class="flex flex-wrap items-center justify-between gap-8px">
          {{ t("listFailed") }}<NButton size="small" @click="state.refresh">{{ $t("common.refresh") }}</NButton>
        </div>
      </NAlert>
      <NDataTable
        v-else
        :columns="columns"
        :data="records"
        :loading="loading"
        :row-key="(row) => row.id"
        :pagination="pagination"
        :scroll-x="scrollX"
        size="small"
        remote
      >
        <template #empty><NEmpty :description="status ? t('noMatchingRecords') : t('noResult')" /></template>
      </NDataTable>
    </NCard>
    <DeliveryDetail
      v-model:visible="detailVisible"
      :row="detailRow"
      :can-view-message="canReadMessages"
      @view-message="showMessageDetails"
      @return-workbench="returnToWorkbench"
    />
    <AnnouncementDetail v-model:visible="messageDetailVisible" :message-id="messageDetailId" />
  </div>
</template>

<style scoped>
  .delivery-stat {
    cursor: pointer;
  }
  .delivery-stat:disabled {
    cursor: default;
  }
  .delivery-stat-selected,
  .delivery-stat:hover:not(:disabled) {
    border-color: rgb(var(--primary-color));
  }
  .delivery-stat-selected {
    background: rgb(var(--primary-color) / 0.06);
  }
</style>
