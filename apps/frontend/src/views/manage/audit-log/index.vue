<script setup lang="tsx">
  import { computed, ref, watch } from "vue"
  import { useRoute, useRouter } from "vue-router"
  import { NButton, NTag } from "naive-ui"
  import { defaultTransform, useNaivePaginatedTable } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { fetchGetAuditLogList, fetchGetAuditLogCatalog } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import AuditLogDetailDrawer from "./modules/audit-log-detail-drawer.vue"
  import AuditLogSearch from "./modules/audit-log-search.vue"
  import { getAuditResultPresentation, auditIdentity, formatAuditTime } from "./audit-log-display"
  import { parseAuditLogQuery, serializeAuditLogQuery } from "./audit-log-query"
  import { useAuditDetail, createLatestAuditRequest } from "./audit-log-detail"

  defineOptions({ name: "ManageAuditLog" })
  const appStore = useAppStore()
  const route = useRoute()
  const router = useRouter()
  const initial = parseAuditLogQuery(route.query)
  const searchParams = ref(initial.filters)
  const draftParams = ref({ ...initial.filters })
  const timeRange = ref(initial.timeRange)
  const draftTimeRange = ref(initial.timeRange)
  const selectedAuditId = ref(initial.selectedAuditId)
  const detailVisible = ref(Boolean(initial.selectedAuditId))
  const catalogState = useAuditDetail(async () => {
    const { data, error } = await fetchGetAuditLogCatalog()
    return { data: data || null, error }
  })
  const catalog = catalogState.data
  const actionLabels = computed(() => new Map((catalog.value?.actions || []).map((action) => [action.code, action])))
  const listFailed = ref(false)
  const requestList = createLatestAuditRequest(() => fetchGetAuditLogList({ ...searchParams.value }))
  const riskType = { normal: "default", sensitive: "warning", critical: "error" } as const
  function syncUrl() {
    return router.replace({
      query: serializeAuditLogQuery({
        filters: searchParams.value,
        timeRange: timeRange.value,
        selectedAuditId: selectedAuditId.value,
      }),
    })
  }
  function openDetail(id: string) {
    selectedAuditId.value = id
    detailVisible.value = true
    void syncUrl()
  }
  const { columns, columnChecks, scrollX, data, loading, getData, getDataByPage, mobilePagination, pagination } =
    useNaivePaginatedTable({
      api: async () => {
        const response = await requestList()
        listFailed.value = Boolean(response.error)
        return response
      },
      immediate: false,
      transform: (response) => defaultTransform(response),
      onPaginationParamsChange: ({ page, pageSize }) => {
        searchParams.value.page = page
        searchParams.value.pageSize = pageSize
        void syncUrl()
      },
      columns: () => [
        {
          key: "occurredAt",
          title: $t("page.manage.auditLog.time"),
          width: 176,
          render: (row) => formatAuditTime(row.occurredAt, catalog.value?.timezone),
        },
        {
          key: "actorName",
          title: $t("page.manage.auditLog.actor"),
          minWidth: 190,
          render: (row) => (
            <div>
              <div>{auditIdentity(row) || $t(`page.manage.auditLog.identity.${row.actorType || "unknown"}` as any)}</div>
              {row.actorType === "system" && row.actorName ? (
                <div class="text-12px text-base-text-3">{row.actorName}</div>
              ) : null}
              {row.impersonationSessionId ? (
                <div class="text-12px text-warning">
                  {$t("page.manage.auditLog.asUser", {
                    user: row.subjectName || row.subjectUsername || row.subjectUserId || "—",
                  })}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          key: "action",
          title: $t("page.manage.auditLog.action"),
          minWidth: 180,
          render: (row) => (
            <div>
              <div class="font-500">
                {actionLabels.value.get(row.action)?.label ||
                  (row.action === "http.request" ? $t("page.manage.auditLog.unclassified") : row.action)}
              </div>
              <div class="mt-4px flex gap-4px">
                {row.riskLevel !== "normal" ? (
                  <NTag size="small" type={riskType[row.riskLevel]}>
                    {$t(`page.manage.auditLog.risk.${row.riskLevel}` as any)}
                  </NTag>
                ) : null}
              </div>
            </div>
          ),
        },
        {
          key: "resource",
          title: $t("page.manage.auditLog.resource"),
          minWidth: 200,
          render: (row) => (
            <div>
              <div>
                {row.targetCount
                  ? $t("page.manage.auditLog.targetCount", { count: row.targetCount })
                  : row.resourceType === "impersonation"
                    ? $t("page.manage.auditLog.sessionFor", { user: row.subjectName || row.subjectUsername || $t("page.manage.auditLog.notRecorded") })
                  : row.resourceName || row.resourceId || $t("page.manage.auditLog.notRecorded")}
              </div>
              <div class="text-12px text-base-text-3">
                {actionLabels.value.get(row.action)?.resourceLabel || row.resourceType || "—"}
                {row.resourceId ? ` · ${row.resourceId.slice(0, 8)}` : ""}
              </div>
            </div>
          ),
        },
        {
          key: "result",
          title: $t("page.manage.auditLog.resultLabel"),
          minWidth: 180,
          render: (row) => (
            <div>
              <NTag size="small" type={getAuditResultPresentation(row.result).type}>
                {$t(getAuditResultPresentation(row.result).key as any)}
              </NTag>
              {row.result !== "success" ? (
                <div class={['mt-4px truncate text-12px', row.result === "failure" ? "text-error" : "text-base-text-2"]} title={row.errorMessage || undefined}>
                  {row.errorMessage || $t("page.manage.auditLog.openFailure")}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          key: "durationMs",
          title: $t("page.manage.auditLog.duration"),
          width: 100,
          render: (row) =>
            row.durationMs === null || row.durationMs === undefined ? "—" : `${Math.round(row.durationMs)} ms`,
        },
        { key: "ip", title: "IP", width: 135, render: (row) => row.ip || "—" },
        {
          key: "operate",
          title: $t("common.operate"),
          width: 80,
          fixed: "right",
          render: (row) => (
            <NButton
              text
              type="primary"
              onClick={(event: MouseEvent) => {
                event.stopPropagation()
                openDetail(row.id)
              }}
            >
              {$t("common.detail")}
            </NButton>
          ),
        },
      ],
    })
  columnChecks.value = columnChecks.value.map((column) => (column.key === "ip" ? { ...column, checked: false } : column))
  pagination.page = initial.filters.page || 1
  pagination.pageSize = initial.filters.pageSize || 20
  void getData()
  async function search() {
    searchParams.value = { ...draftParams.value, page: 1 }
    timeRange.value = draftTimeRange.value
    await syncUrl()
    await getDataByPage(1)
  }
  function clearFilters() {
    searchParams.value = { page: 1, pageSize: 20 }
    draftParams.value = { ...searchParams.value }
    timeRange.value = "all"
    draftTimeRange.value = "all"
    void search()
  }
  const signature = (value: object) =>
    JSON.stringify(
      Object.entries(value)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .sort(([a], [b]) => a.localeCompare(b)),
    )
  const filterSignature = (value: Api.SystemManage.AuditLogQuery) =>
    signature({ ...value, page: undefined, pageSize: undefined })
  const pendingFilters = computed(() => filterSignature(draftParams.value) !== filterSignature(searchParams.value))
  const appliedConditions = computed(() => {
    const labels: Record<string, string> = {
      keyword: $t("page.manage.auditLog.keyword"),
      actorId: $t("page.manage.auditLog.actor"),
      resourceType: $t("page.manage.auditLog.resourceType"),
      resourceKeyword: $t("page.manage.auditLog.resourceName"),
      actorKeyword: $t("page.manage.auditLog.actorAccount"),
      resourceId: $t("page.manage.auditLog.resourceId"),
      subjectUserId: $t("page.manage.auditLog.detail.subjectId"),
      impersonationSessionId: $t("page.manage.auditLog.detail.sessionId"),
      startTime: $t("page.manage.auditLog.fromTime"),
      endTime: $t("page.manage.auditLog.toTime"),
      result: $t("page.manage.auditLog.resultLabel"),
      riskLevel: $t("page.manage.auditLog.riskLabel"),
      source: $t("page.manage.auditLog.sourceLabel"),
      action: $t("page.manage.auditLog.action"),
      ip: "IP", requestId: "Request ID", correlationId: "Correlation ID",
    }
    return Object.entries(searchParams.value)
      .filter(([key, value]) => !["page", "pageSize", "view"].includes(key) && value !== undefined && value !== null && value !== "")
      .map(([key, value]) => {
        let label = String(value)
        if (["startTime", "endTime"].includes(key)) label = formatAuditTime(label, catalog.value?.timezone)
        const category = { result: "result", riskLevel: "risk", source: "source" }[key]
        if (category) label = $t(`page.manage.auditLog.${category}.${label}` as any)
        if (key === "action") label = actionLabels.value.get(label)?.label || label
        if (key === "resourceType")
          label = catalog.value?.actions.find(action => action.resourceType === label)?.resourceLabel || label
        return `${labels[key] || key}: ${label}`
      })
  })
  watch(
    () => route.query,
    (query) => {
      const state = parseAuditLogQuery(query)
      if (signature(state.filters) !== signature(searchParams.value)) {
        searchParams.value = state.filters
        draftParams.value = { ...state.filters }
        draftTimeRange.value = state.timeRange
        void getDataByPage(state.filters.page || 1)
      }
      timeRange.value = state.timeRange
      selectedAuditId.value = state.selectedAuditId
      detailVisible.value = Boolean(state.selectedAuditId)
    },
  )
  watch(detailVisible, (visible) => {
    if (!visible) {
      selectedAuditId.value = null
      void syncUrl()
    }
  })
  watch(
    () => appStore.locale,
    (locale) => void catalogState.load(locale),
    { immediate: true },
  )
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <AuditLogSearch v-model:model="draftParams" :catalog="catalog" @search="search" @range="draftTimeRange = $event" />
    <NAlert v-if="catalogState.failed.value" type="warning">{{ $t("page.manage.auditLog.catalogFailed") }}</NAlert>
    <NCard
      :title="$t('page.manage.auditLog.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
      content-class="flex-col min-h-0"
    >
      <div class="mb-12px flex-col gap-8px" aria-live="polite">
        <div class="flex flex-wrap items-center gap-8px">
          <span class="font-500">{{ $t("page.manage.auditLog.appliedFilters") }}</span>
          <NTag size="small">{{ $t(`page.manage.auditLog.views.${searchParams.view || 'all'}` as any) }}</NTag>
          <NTag v-if="timeRange === 'all'" size="small">{{ $t("page.manage.auditLog.ranges.all") }}</NTag>
          <span v-for="condition in appliedConditions" :key="condition" class="break-all text-12px text-base-text-2">{{
            condition
          }}</span>
        </div>
        <span v-if="pendingFilters" class="text-warning">{{ $t("page.manage.auditLog.filtersPending") }}</span>
      </div>
      <template #header-extra
        ><TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData"
      /></template>
      <NAlert v-if="listFailed" type="error" class="mb-12px"
        >{{ $t("page.manage.auditLog.loadFailed") }}
        <NButton text @click="getData">{{ $t("common.refresh") }}</NButton></NAlert
      >
      <NDataTable
        v-if="!listFailed"
        :columns="columns"
        :data="data"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="scrollX"
        :loading="loading"
        remote
        :row-key="(row) => row.id"
        :row-props="row => ({ class: 'cursor-pointer', tabindex: 0, onClick: () => openDetail(row.id), onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter') openDetail(row.id) } })"
        :pagination="mobilePagination"
        class="sm:flex-1-hidden"
      >
        <template #empty
          ><NEmpty v-if="!loading" :description="$t('page.manage.auditLog.noMatches')"
            ><template #extra
              ><NButton size="small" @click="clearFilters">{{
                $t("page.manage.auditLog.clearFilters")
              }}</NButton></template
            ></NEmpty
          ></template
        >
      </NDataTable>
    </NCard>
    <AuditLogDetailDrawer v-model:visible="detailVisible" :audit-id="selectedAuditId" :catalog="catalog" />
  </div>
</template>
