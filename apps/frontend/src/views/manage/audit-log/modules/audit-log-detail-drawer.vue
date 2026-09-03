<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import dayjs from "dayjs"
  import { $t } from "@/locales"
  import { fetchGetAuditLogDetail } from "@/service/api"

  defineOptions({ name: "AuditLogDetailDrawer" })

  const props = defineProps<{ auditId: string | null }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const loading = ref(false)
  const detail = ref<Api.SystemManage.AuditLogDetail | null>(null)

  const requestSummary = computed(() => {
    if (!detail.value?.requestSummary) return "-"
    return JSON.stringify(detail.value.requestSummary, null, 2)
  })

  function valueOrDash(value: unknown) {
    return value === null || value === undefined || value === "" ? "-" : String(value)
  }

  function formatTime(value?: string | null) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-"
  }

  async function loadDetail() {
    detail.value = null
    if (!props.auditId || !visible.value) return
    loading.value = true
    const { data, error } = await fetchGetAuditLogDetail(props.auditId)
    loading.value = false
    if (error) return
    detail.value = data
  }

  watch([() => props.auditId, visible], loadDetail)
</script>

<template>
  <NDrawer v-model:show="visible" width="min(640px, 92vw)" placement="right">
    <NDrawerContent :title="$t('page.manage.auditLog.detail.title')" closable>
      <NSpin :show="loading">
        <template v-if="detail">
          <h3 class="mt-0 text-14px font-700 text-base-text-1">{{ $t("page.manage.auditLog.detail.event") }}</h3>
          <NDescriptions :column="1" label-placement="left" bordered size="small">
            <NDescriptionsItem :label="$t('page.manage.auditLog.time')">{{
              formatTime(detail.occurredAt)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.actor')">{{
              detail.actorName || "-"
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.action')">{{ detail.action }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.resourceType')">{{
              valueOrDash(detail.resourceType)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.resourceName')">{{
              valueOrDash(detail.resourceName)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.resultLabel')">{{
              $t(`page.manage.auditLog.result.${detail.result}` as any)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.riskLabel')">{{
              $t(`page.manage.auditLog.risk.${detail.riskLevel}` as any)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.sourceLabel')">{{
              $t(`page.manage.auditLog.source.${detail.source}` as any)
            }}</NDescriptionsItem>
          </NDescriptions>

          <h3 class="mt-20px text-14px font-700 text-base-text-1">{{ $t("page.manage.auditLog.detail.request") }}</h3>
          <NDescriptions :column="1" label-placement="left" bordered size="small">
            <NDescriptionsItem :label="$t('page.manage.auditLog.httpMethod')">{{
              valueOrDash(detail.httpMethod)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.path')">{{
              valueOrDash(detail.path)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.responseCode')">{{
              valueOrDash(detail.responseCode)
            }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.ip')">{{ valueOrDash(detail.ip) }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.userAgent')">{{
              valueOrDash(detail.userAgent)
            }}</NDescriptionsItem>
          </NDescriptions>

          <h3 class="mt-20px text-14px font-700 text-base-text-1">{{ $t("page.manage.auditLog.detail.trace") }}</h3>
          <NDescriptions :column="1" label-placement="left" bordered size="small">
            <NDescriptionsItem label="Request ID">{{ valueOrDash(detail.requestId) }}</NDescriptionsItem>
            <NDescriptionsItem label="Correlation ID">{{ valueOrDash(detail.correlationId) }}</NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.requestSummary')">
              <pre class="m-0 max-h-280px overflow-auto whitespace-pre-wrap break-all text-12px">{{
                requestSummary
              }}</pre>
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.errorMessage')">
              <span :class="detail.errorMessage ? 'text-error' : ''">{{ valueOrDash(detail.errorMessage) }}</span>
            </NDescriptionsItem>
          </NDescriptions>
        </template>
        <NEmpty v-else-if="!loading" :description="$t('page.manage.auditLog.detail.empty')" />
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
