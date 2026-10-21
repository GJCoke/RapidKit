<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import dayjs from "dayjs"
  import { NButton, NTag } from "naive-ui"
  import { residentActionModel } from "@/hooks/business/table-actions/layout"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { useAuth } from "@/hooks/business/auth"
  import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
  import { defaultTransform, useNaivePaginatedTable } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { fetchGetAuditLogList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import AuditLogDetailDrawer from "./modules/audit-log-detail-drawer.vue"
  import AuditLogSearch from "./modules/audit-log-search.vue"
  import { getAuditResultPresentation } from "./audit-log-display"

  const { getActionContext } = useAuth()

  defineOptions({ name: "ManageAuditLog" })

  const appStore = useAppStore()
  const actions = useTableActions(() => residentActionModel<Api.SystemManage.AuditLogItem>({ detail: $t("common.detail") }), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)
  const detailVisible = ref(false)
  const selectedAuditId = ref<string | null>(null)
  const searchParams: Api.SystemManage.AuditLogQuery = reactive({ page: 1, pageSize: DEFAULT_PAGE_SIZE })

  const riskType: Record<Api.SystemManage.AuditRiskLevel, "default" | "warning" | "error"> = {
    normal: "default",
    sensitive: "warning",
    critical: "error",
  }
  const sourceType: Record<Api.SystemManage.AuditSource, "info" | "success" | "default"> = {
    http: "info",
    domain_event: "success",
    system: "default",
  }

  function openDetail(id: string) {
    selectedAuditId.value = id
    detailVisible.value = true
  }

  const { columns, columnChecks, scrollX, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetAuditLogList(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: ({ page, pageSize }) => {
      searchParams.page = page
      searchParams.pageSize = pageSize
    },
    columns: () => [
      {
        key: "occurredAt",
        title: $t("page.manage.auditLog.time"),
        width: 168,
        render: (row) => dayjs(row.occurredAt).format("YYYY-MM-DD HH:mm:ss"),
      },
      {
        key: "actorName",
        title: $t("page.manage.auditLog.actor"),
        minWidth: 280,
        ellipsis: { tooltip: true },
        render: (row) => row.impersonationSessionId
          ? $t("page.manage.auditLog.impersonatedAction", { actor: row.actorName || row.actorId || "-", subject: row.subjectName || row.subjectUserId || "-", action: row.action })
          : row.actorName || "-",
      },
      { key: "action", title: $t("page.manage.auditLog.action"), width: 120, ellipsis: { tooltip: true } },
      {
        key: "resource",
        title: $t("page.manage.auditLog.resource"),
        minWidth: 180,
        render: (row) => (
          <div class="min-w-0">
            <div class="truncate text-base-text-1">{row.resourceName || row.resourceType || "-"}</div>
            {row.resourceName && row.resourceType ? <div class="truncate text-12px text-base-text-3">{row.resourceType}</div> : null}
          </div>
        ),
      },
      {
        key: "result",
        title: $t("page.manage.auditLog.resultLabel"),
        align: "center",
        width: 88,
        render: (row) => <NTag type={getAuditResultPresentation(row.result).type}>{$t(getAuditResultPresentation(row.result).key as any)}</NTag>,
      },
      {
        key: "riskLevel",
        title: $t("page.manage.auditLog.riskLabel"),
        align: "center",
        width: 96,
        render: (row) => <NTag type={riskType[row.riskLevel]}>{$t(`page.manage.auditLog.risk.${row.riskLevel}` as any)}</NTag>,
      },
      {
        key: "source",
        title: $t("page.manage.auditLog.sourceLabel"),
        align: "center",
        width: 110,
        render: (row) => <NTag type={sourceType[row.source]} bordered={false}>{$t(`page.manage.auditLog.source.${row.source}` as any)}</NTag>,
      },
      { key: "ip", title: "IP", width: 130, render: (row) => row.ip || "-" },
      ...actions.column({
        key: "operate",
        title: $t("common.operate"),
        fixed: "right",
        render: (row) => (
          <NButton type="primary" text onClick={(event: MouseEvent) => { event.stopPropagation(); openDetail(row.id) }}>
            {$t("common.detail")}
          </NButton>
        ),
      }),
    ],
  })
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <AuditLogSearch v-model:model="searchParams" @search="getDataByPage(1)" />
    <NCard
      :title="$t('page.manage.auditLog.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData" />
      </template>
      <NDataTable
        :columns="columns"
        :data="data"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="scrollX"
        :loading="loading"
        remote
        :row-key="(row) => row.id"
        :row-props="(row) => ({ class: 'cursor-pointer', onClick: () => openDetail(row.id) })"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
    </NCard>
    <AuditLogDetailDrawer v-model:visible="detailVisible" :audit-id="selectedAuditId" />
  </div>
</template>
