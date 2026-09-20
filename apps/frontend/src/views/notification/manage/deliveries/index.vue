<script setup lang="ts">
  import { computed, ref } from "vue"
  import { useAuth } from "@/hooks/business/auth"
  import { fetchDeliverySummary, fetchRetryFailedDeliveries } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({ name: "NotificationDeliveries" })

  const permissions = {
    summary: "GET:/api/v1/admin/notification-deliveries/{message_id}/summary",
    retry: "POST:/api/v1/admin/notification-deliveries/{message_id}/retry-failed",
  }
  const { hasAuth } = useAuth()
  const messageId = ref("")
  const summary = ref<Api.Notification.DeliverySummary | null>(null)
  const loading = ref(false)
  const retrying = ref(false)
  const queried = ref(false)
  const statusOrder = ["pending", "processing", "retrying", "sent", "dead"]
  const validMessageId = computed(() =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId.value.trim()),
  )

  async function query() {
    if (!validMessageId.value || loading.value || !hasAuth(permissions.summary)) return
    loading.value = true
    try {
      const { data, error } = await fetchDeliverySummary(messageId.value.trim())
      if (!error && data) summary.value = data
      if (!error) queried.value = true
    } finally {
      loading.value = false
    }
  }

  async function retry() {
    if (!summary.value || retrying.value || !hasAuth(permissions.retry)) return
    retrying.value = true
    try {
      const { data, error } = await fetchRetryFailedDeliveries(summary.value.messageId)
      if (error) return
      window.$message?.success(
        $t("page.notification.manage.deliveries.retried" as I18nFullKey, { count: data?.retried ?? 0 }),
      )
      await query()
    } finally {
      retrying.value = false
    }
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard :bordered="false" size="small" class="card-wrapper">
      <NCollapse>
        <NCollapseItem :title="$t('common.search')" name="delivery-search">
          <NForm label-placement="left" :label-width="100">
            <NGrid responsive="screen" item-responsive>
              <NFormItemGi
                span="24 m:16"
                :label="$t('page.notification.manage.deliveries.messageId' as I18nFullKey)"
                class="pr-24px"
              >
                <div class="w-full">
                  <NInput
                    v-model:value="messageId"
                    clearable
                    :status="messageId && !validMessageId ? 'error' : undefined"
                    :placeholder="$t('page.notification.manage.deliveries.messageIdPlaceholder' as I18nFullKey)"
                    @keyup.enter="query"
                  />
                  <NText v-if="messageId && !validMessageId" depth="3" class="mt-6px block text-12px text-error">{{
                    $t("page.notification.manage.deliveries.messageIdInvalid" as I18nFullKey)
                  }}</NText>
                </div>
              </NFormItemGi>
              <NFormItemGi span="24 m:8" class="pr-24px">
                <NSpace class="w-full" justify="end">
                  <NButton
                    v-if="hasAuth(permissions.summary)"
                    type="primary"
                    ghost
                    :loading="loading"
                    :disabled="!validMessageId"
                    @click="query"
                  >
                    <template #icon><icon-ic-round-search class="text-icon" /></template>
                    {{ $t("common.search") }}
                  </NButton>
                </NSpace>
              </NFormItemGi>
            </NGrid>
          </NForm>
        </NCollapseItem>
      </NCollapse>
    </NCard>

    <NCard
      :title="$t('page.notification.manage.deliveries.resultTitle' as I18nFullKey)"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <NButton
          v-if="hasAuth(permissions.retry)"
          size="small"
          ghost
          type="warning"
          :loading="retrying"
          :disabled="!summary"
          @click="retry"
        >
          <template #icon><icon-ic-round-refresh class="text-icon" /></template>
          {{ $t("page.notification.manage.deliveries.retryFailed" as I18nFullKey) }}
        </NButton>
      </template>
      <NSpin :show="loading">
        <NEmpty
          v-if="!summary"
          class="mt-56px"
          :description="
            $t(
              queried
                ? 'page.notification.manage.deliveries.noResult'
                : ('page.notification.manage.deliveries.empty' as I18nFullKey),
            )
          "
        />
        <NGrid v-else :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
          <NGi v-for="status in statusOrder" :key="status" span="24 s:12 m:8 l:4">
            <div class="flex-y-center justify-between rd-8px bg-theme-modal px-16px py-14px">
              <NTag
                size="small"
                :type="
                  status === 'sent'
                    ? 'success'
                    : status === 'dead'
                      ? 'error'
                      : status === 'retrying'
                        ? 'warning'
                        : 'info'
                "
                >{{ $t(`page.notification.manage.deliveries.status.${status}` as I18nFullKey) }}</NTag
              >
              <span class="text-22px font-700 tabular-nums text-base-text-1">{{ summary.byStatus[status] ?? 0 }}</span>
            </div>
          </NGi>
        </NGrid>
      </NSpin>
    </NCard>
  </div>
</template>
