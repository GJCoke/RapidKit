<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { $t } from "@/locales"
  import { fetchGetAuditLogList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { useAuditDetail } from "../audit-log-detail"
  import { auditIdentity, formatAuditTime, getAuditResultPresentation } from "../audit-log-display"

  const props = defineProps<{
    filters: Api.SystemManage.AuditLogQuery
    catalog: Api.SystemManage.AuditCatalog | null
  }>()
  const emit = defineEmits<{ select: [id: string]; close: [] }>()
  const appStore = useAppStore()
  const page = ref(1)
  const state = useAuditDetail(async () => {
    const { data, error } = await fetchGetAuditLogList({ ...props.filters, page: page.value, pageSize: 10 })
    return { data: data || null, error }
  })
  const requestKey = computed(() => JSON.stringify([props.filters, page.value, appStore.locale]))
  watch(
    () => props.filters,
    () => {
      page.value = 1
    },
  )
  watch(requestKey, (key) => void state.load(key), { immediate: true })
  const actions = computed(() => new Map(props.catalog?.actions.map((action) => [action.code, action]) || []))
</script>

<template>
  <section class="mt-16px" :aria-label="$t('page.manage.auditLog.related')">
    <div class="mb-16px flex flex-wrap items-center justify-between gap-8px">
      <span class="text-12px text-base-text-2">{{ $t("page.manage.auditLog.relatedAllTime") }}</span>
      <NButton text size="small" @click="emit('close')">{{ $t("page.manage.auditLog.closeRelated") }}</NButton>
    </div>
    <NSpin :show="state.loading.value">
      <NAlert v-if="state.failed.value" type="error">
        {{ $t("page.manage.auditLog.loadFailed") }}
        <NButton text @click="state.load(requestKey)">{{ $t("common.refresh") }}</NButton>
      </NAlert>
      <NTimeline v-else-if="state.data.value?.records.length">
        <NTimelineItem
          v-for="row in state.data.value.records"
          :key="row.id"
          :type="getAuditResultPresentation(row.result).type"
          :time="formatAuditTime(row.occurredAt, catalog?.timezone)"
          :title="
            actions.get(row.action)?.label ||
            (row.action === 'http.request' ? $t('page.manage.auditLog.unclassified') : row.action)
          "
        >
          <div class="flex flex-wrap items-center gap-8px">
            <span>{{
              auditIdentity(row) || $t(`page.manage.auditLog.identity.${row.actorType || "unknown"}` as any)
            }}</span>
            <span class="break-all">{{
              row.resourceName ||
              (row.resourceType === "impersonation" ? row.subjectName || row.subjectUsername : null) ||
              (row.targetCount
                ? $t("page.manage.auditLog.targetCount", { count: row.targetCount })
                : row.resourceId || $t("page.manage.auditLog.notRecorded"))
            }}</span>
            <NTag size="small" :type="getAuditResultPresentation(row.result).type">{{
              $t(getAuditResultPresentation(row.result).key as any)
            }}</NTag>
            <NButton text size="small" @click="emit('select', row.id)">{{
              $t("page.manage.auditLog.openEvent")
            }}</NButton>
          </div>
        </NTimelineItem>
      </NTimeline>
      <NEmpty v-else-if="!state.loading.value" :description="$t('page.manage.auditLog.noRelated')" />
    </NSpin>
    <NPagination
      v-if="state.data.value && state.data.value.total > 10"
      v-model:page="page"
      :page-size="10"
      :item-count="state.data.value.total"
      class="mt-12px"
    />
  </section>
</template>
