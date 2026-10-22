<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { $t } from "@/locales"
  import { fetchGetAuditLogDetail, fetchGetAuditLogTargets } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import {
    getAuditResultPresentation,
    auditIdentity,
    auditValue,
    auditChangeValue,
    auditNoChangesKey,
    formatAuditTime,
  } from "../audit-log-display"
  import { useAuditDetail } from "../audit-log-detail"
  import AuditLogRelatedRecords from "./audit-log-related-records.vue"

  defineOptions({ name: "AuditLogDetailDrawer" })
  const props = defineProps<{ auditId: string | null; catalog: Api.SystemManage.AuditCatalog | null }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const appStore = useAppStore()
  const detailHistory = ref<string[]>([])
  const activeAuditId = computed(() => detailHistory.value.at(-1) || null)
  const relatedFilters = ref<Api.SystemManage.AuditLogQuery | null>(null)
  const technicalExpanded = ref<string[]>([])
  const state = useAuditDetail(async (id) => {
    const { data, error } = await fetchGetAuditLogDetail(id)
    return { data: data || null, error }
  })
  const detail = state.data
  const targetPage = ref(1)
  const targetsState = useAuditDetail(async (id) => {
    const { data, error } = await fetchGetAuditLogTargets(id, { page: targetPage.value, pageSize: 20 })
    return { data: data || null, error }
  })
  const action = computed(() => props.catalog?.actions.find((item) => item.code === detail.value?.action))
  const resourceLabel = computed(() => {
    const row = detail.value
    if (!row) return ""
    if (row.resourceType === "impersonation")
      return $t("page.manage.auditLog.sessionFor", {
        user: row.subjectName || row.subjectUsername || $t("page.manage.auditLog.notRecorded"),
      })
    return (
      row.resourceName ||
      (row.targetCount
        ? $t("page.manage.auditLog.targetCount", { count: row.targetCount })
        : row.resourceId || $t("page.manage.auditLog.notRecorded"))
    )
  })
  const summary = computed(() => {
    const row = detail.value
    if (!row) return ""
    let actor = auditIdentity(row) || $t(`page.manage.auditLog.identity.${row.actorType || "unknown"}` as any)
    if (row.action === "impersonation.start" || row.action === "impersonation.stop")
      return $t(
        row.action === "impersonation.start"
          ? "page.manage.auditLog.sessionStartSummary"
          : "page.manage.auditLog.sessionEndSummary",
        {
          actor,
          subject: row.subjectName || row.subjectUsername || $t("page.manage.auditLog.notRecorded"),
          result: $t(getAuditResultPresentation(row.result).key as any),
        },
      )
    if (row.impersonationSessionId)
      actor += ` · ${$t("page.manage.auditLog.asUser", { user: row.subjectName || row.subjectUsername || row.subjectUserId || "—" })}`
    return $t(`page.manage.auditLog.summary.${row.result}` as any, {
      actor,
      resource: resourceLabel.value,
      action:
        action.value?.label || (row.action === "http.request" ? $t("page.manage.auditLog.unclassified") : row.action),
    })
  })
  const initiator = computed(
    () => detail.value?.metadata?.initiated_by as { name?: string; username?: string; id?: string } | undefined,
  )
  function changeValue(value: unknown, field: string) {
    if (typeof value === "boolean")
      return field === "enabled"
        ? $t(`page.manage.auditLog.values.${value ? "enabled" : "disabled"}`)
        : $t(`common.yesOrNo.${value ? "yes" : "no"}`)
    return auditValue(value)
  }
  const requestSummary = computed(() =>
    detail.value?.requestSummary
      ? JSON.stringify(detail.value.requestSummary, null, 2)
      : $t("page.manage.auditLog.notRecorded"),
  )
  function formatTime(value?: string | null) {
    return formatAuditTime(value, props.catalog?.timezone)
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      window.$message?.success($t("page.manage.auditLog.copied"))
    } catch {
      window.$message?.error($t("page.manage.auditLog.copyFailed"))
    }
  }
  function filter(value: Api.SystemManage.AuditLogQuery) {
    relatedFilters.value = value
  }
  function openRelated(id: string) {
    if (id !== activeAuditId.value) detailHistory.value.push(id)
  }
  watch(
    [() => props.auditId, visible],
    () => {
      detailHistory.value = visible.value && props.auditId ? [props.auditId] : []
    },
    { immediate: true },
  )
  watch(
    [activeAuditId, () => appStore.locale],
    () => {
      targetPage.value = 1
      relatedFilters.value = null
      technicalExpanded.value = []
      void state.load(activeAuditId.value)
    },
    { immediate: true },
  )
  watch([detail, targetPage], () => void targetsState.load(detail.value?.targetCount ? detail.value.id : null))
</script>

<template>
  <NDrawer
    v-model:show="visible"
    :width="appStore.isMobile ? '100vw' : 'min(880px, 94vw)'"
    placement="right"
    :auto-focus="true"
  >
    <NDrawerContent :title="$t('page.manage.auditLog.detail.title')" closable>
      <NButton v-if="detailHistory.length > 1" class="mb-16px" size="small" @click="detailHistory.pop()">{{
        $t("page.manage.auditLog.backToEvent")
      }}</NButton>
      <NSpin :show="state.loading.value">
        <NAlert v-if="state.failed.value" type="error"
          >{{ $t("page.manage.auditLog.loadFailed") }}
          <NButton text @click="state.load(activeAuditId)">{{ $t("common.refresh") }}</NButton></NAlert
        >
        <template v-else-if="detail">
          <div class="mb-20px flex-col gap-8px">
            <div class="flex flex-wrap items-center gap-8px">
              <span class="text-20px font-600">{{
                action?.label ||
                (detail.action === "http.request" ? $t("page.manage.auditLog.unclassified") : detail.action)
              }}</span
              ><NTag :type="getAuditResultPresentation(detail.result).type">{{
                $t(getAuditResultPresentation(detail.result).key as any)
              }}</NTag>
            </div>
            <span class="text-base-text-3"
              >{{ formatTime(detail.occurredAt) }} · {{ catalog?.timezone }} ·
              {{
                detail.durationMs == null
                  ? $t("page.manage.auditLog.notRecorded")
                  : `${Math.round(detail.durationMs)} ms`
              }}</span
            >
          </div>
          <p class="mb-20px text-18px font-500 leading-relaxed">{{ summary }}</p>
          <NDescriptions :column="1" label-placement="left" bordered size="small">
            <NDescriptionsItem :label="$t('page.manage.auditLog.actor')"
              >{{
                auditIdentity(detail) || $t(`page.manage.auditLog.identity.${detail.actorType || "unknown"}` as any)
              }}
              <div v-if="detail.actorType === 'system' && detail.actorName" class="text-12px text-base-text-3">
                {{ detail.actorName }}
              </div>
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="detail.metadata?.attempted_username"
              :label="$t('page.manage.auditLog.attemptedUsername')"
              >{{ detail.metadata.attempted_username }}</NDescriptionsItem
            >
            <NDescriptionsItem v-if="initiator" :label="$t('page.manage.auditLog.initiatedBy')">{{
              initiator.name || initiator.username || initiator.id || "—"
            }}</NDescriptionsItem>
            <NDescriptionsItem v-if="detail.metadata?.attempt != null" :label="$t('page.manage.auditLog.attempt')">{{
              detail.metadata.attempt
            }}</NDescriptionsItem>
            <NDescriptionsItem v-if="detail.impersonationSessionId" :label="$t('page.manage.auditLog.detail.identity')"
              >{{
                $t("page.manage.auditLog.asUser", {
                  user: detail.subjectName || detail.subjectUsername || detail.subjectUserId || "—",
                })
              }}
              <div>{{ $t("page.manage.auditLog.detail.reason") }}: {{ detail.metadata?.reason || "—" }}</div>
              <div v-if="detail.metadata?.end_reason">
                {{ $t("page.manage.auditLog.detail.endReason") }}: {{ detail.metadata.end_reason }}
              </div></NDescriptionsItem
            >
            <NDescriptionsItem :label="$t('page.manage.auditLog.resource')"
              >{{ action?.resourceLabel || detail.resourceType || "—" }} ·
              {{ resourceLabel }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.auditLog.riskLabel')">{{
              $t(`page.manage.auditLog.risk.${detail.riskLevel}` as any)
            }}</NDescriptionsItem>
          </NDescriptions>

          <h3 class="mt-24px text-15px font-600">{{ $t("page.manage.auditLog.changes") }}</h3>
          <NTable
            v-if="detail.changes?.length && ['success', 'partial'].includes(detail.result)"
            size="small"
            :single-line="false"
          >
            <thead>
              <tr>
                <th>{{ $t("page.manage.auditLog.field") }}</th>
                <th>{{ $t("page.manage.auditLog.before") }}</th>
                <th>{{ $t("page.manage.auditLog.after") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="change in detail.changes" :key="change.field">
                <td>{{ action?.fields?.[change.field] || change.field }}</td>
                <td class="max-w-240px break-all">
                  {{ change.redacted ? "•••" : changeValue(auditChangeValue(change, "before"), change.field) }}
                </td>
                <td class="max-w-240px break-all">
                  {{
                    change.redacted
                      ? $t("page.manage.auditLog.secretChanged")
                      : changeValue(auditChangeValue(change, "after"), change.field)
                  }}
                </td>
              </tr>
            </tbody>
          </NTable>
          <NEmpty v-else size="small" :description="$t(auditNoChangesKey(detail.result, detail.action))" />
          <p v-if="detail.changes?.length" class="mt-8px text-12px text-base-text-2">
            {{ $t("page.manage.auditLog.snapshotHint") }}
          </p>
          <template v-if="detail.targetCount">
            <h3 class="mt-24px text-15px font-600">{{ $t("page.manage.auditLog.batchTargets") }}</h3>
            <NAlert v-if="targetsState.failed.value" type="error"
              >{{ $t("page.manage.auditLog.loadFailed") }}
              <NButton text @click="targetsState.load(detail.id)">{{ $t("common.refresh") }}</NButton>
            </NAlert>
            <NSpin :show="targetsState.loading.value"
              ><NList bordered
                ><NListItem v-for="target in targetsState.data.value?.records || []" :key="target.id"
                  ><div class="flex flex-wrap items-center justify-between gap-8px">
                    <div>
                      {{ target.resourceName || target.resourceId }}
                      <div class="break-all text-12px text-base-text-3">
                        {{ target.resourceType }} · {{ target.resourceId }}
                      </div>
                    </div>
                    <NTag :type="getAuditResultPresentation(target.result).type">{{
                      $t(getAuditResultPresentation(target.result).key as any)
                    }}</NTag
                    ><span v-if="target.errorMessage" class="break-all text-error">{{ target.errorMessage }}</span
                    ><NButton
                      text
                      size="small"
                      @click="filter({ resourceType: target.resourceType, resourceId: target.resourceId })"
                      >{{ $t("page.manage.auditLog.sameResource") }}</NButton
                    >
                  </div></NListItem
                ></NList
              ></NSpin
            >
            <NPagination
              v-model:page="targetPage"
              :page-size="20"
              :item-count="targetsState.data.value?.total || 0"
              class="mt-12px"
            />
          </template>

          <NAlert
            v-if="detail.result !== 'success'"
            :type="detail.result === 'failure' ? 'error' : 'warning'"
            class="mt-24px"
            :title="$t('page.manage.auditLog.failureReason')"
            >{{
              detail.errorMessage ||
              $t(
                detail.result === "unknown"
                  ? "page.manage.auditLog.unknownReason"
                  : detail.result === "partial"
                    ? "page.manage.auditLog.partialReason"
                    : "page.manage.auditLog.failureNotRecorded",
              )
            }}
            <div class="mt-8px text-12px">
              {{ $t("page.manage.auditLog.businessCode") }}: {{ detail.businessCode ?? "—" }} · HTTP:
              {{ detail.httpStatus ?? detail.responseCode ?? "—" }}
            </div></NAlert
          >
          <NCollapse v-model:expanded-names="technicalExpanded" class="mt-24px"
            ><NCollapseItem :title="$t('page.manage.auditLog.technicalInfo')" name="request">
              <NDescriptions :column="1" label-placement="left" bordered size="small">
                <NDescriptionsItem
                  v-for="item in [
                    { label: $t('page.manage.auditLog.logId'), value: detail.id },
                    { label: $t('page.manage.auditLog.actionCode'), value: detail.action },
                    { label: $t('page.manage.auditLog.actor'), value: detail.actorId },
                    { label: $t('page.manage.auditLog.resourceId'), value: detail.resourceId },
                    { label: $t('page.manage.auditLog.detail.subjectId'), value: detail.subjectUserId },
                  ].filter((item) => item.value)"
                  :key="item.label"
                  :label="item.label"
                >
                  <span class="break-all">{{ item.value }}</span>
                  <NButton text size="tiny" @click="copy(item.value!)">{{ $t("page.manage.auditLog.copy") }}</NButton>
                </NDescriptionsItem>
                <NDescriptionsItem :label="$t('page.manage.auditLog.sourceLabel')">{{
                  $t(`page.manage.auditLog.source.${detail.source}` as any)
                }}</NDescriptionsItem>
                <NDescriptionsItem :label="$t('page.manage.auditLog.path')"
                  ><code class="break-all"
                    >{{ detail.httpMethod }} {{ detail.path || $t("page.manage.auditLog.notRecorded") }}</code
                  ></NDescriptionsItem
                >
                <NDescriptionsItem label="IP">{{ detail.ip || "—" }}</NDescriptionsItem>
                <NDescriptionsItem label="User Agent"
                  ><span class="break-all">{{ detail.userAgent || "—" }}</span></NDescriptionsItem
                >
                <NDescriptionsItem label="Request ID"
                  ><span class="break-all">{{ detail.requestId || "—" }}</span>
                  <NButton v-if="detail.requestId" text size="tiny" @click="copy(detail.requestId)">{{
                    $t("page.manage.auditLog.copy")
                  }}</NButton></NDescriptionsItem
                >
                <NDescriptionsItem label="Correlation ID"
                  ><span class="break-all">{{ detail.correlationId || "—" }}</span>
                  <NButton v-if="detail.correlationId" text size="tiny" @click="copy(detail.correlationId)">{{
                    $t("page.manage.auditLog.copy")
                  }}</NButton></NDescriptionsItem
                >
                <NDescriptionsItem
                  v-if="detail.impersonationSessionId"
                  :label="$t('page.manage.auditLog.detail.sessionId')"
                  ><span class="break-all">{{ detail.impersonationSessionId }}</span></NDescriptionsItem
                >
              </NDescriptions>
              <h4>{{ $t("page.manage.auditLog.requestSummary") }} · {{ $t("page.manage.auditLog.redacted") }}</h4>
              <NAlert v-if="detail.requestSummary?._truncated" type="warning" class="mb-8px">{{
                $t("page.manage.auditLog.truncated")
              }}</NAlert>
              <pre
                class="max-h-280px overflow-auto whitespace-pre-wrap break-all rd-8px bg-theme-fill p-12px text-12px"
                >{{ requestSummary }}</pre
              >
            </NCollapseItem></NCollapse
          >
          <h3 class="mt-24px text-15px font-600">{{ $t("page.manage.auditLog.related") }}</h3>
          <NSpace>
            <NButton v-if="detail.requestId" size="small" @click="filter({ requestId: detail.requestId })">{{
              $t("page.manage.auditLog.sameRequest")
            }}</NButton>
            <NButton
              v-if="detail.correlationId"
              size="small"
              @click="filter({ correlationId: detail.correlationId })"
              >{{ $t("page.manage.auditLog.sameCorrelation") }}</NButton
            >
            <NButton
              v-if="detail.resourceId && detail.resourceType"
              size="small"
              @click="filter({ resourceType: detail.resourceType, resourceId: detail.resourceId })"
              >{{ $t("page.manage.auditLog.sameResource") }}</NButton
            >
            <NButton
              v-if="detail.impersonationSessionId"
              size="small"
              @click="filter({ impersonationSessionId: detail.impersonationSessionId })"
              >{{ $t("page.manage.auditLog.sameSession") }}</NButton
            >
          </NSpace>
          <AuditLogRelatedRecords
            v-if="relatedFilters"
            :filters="relatedFilters"
            :catalog="catalog"
            @select="openRelated"
            @close="relatedFilters = null"
          />
        </template>
        <NEmpty v-else-if="!state.loading.value" :description="$t('page.manage.auditLog.detail.empty')" />
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
