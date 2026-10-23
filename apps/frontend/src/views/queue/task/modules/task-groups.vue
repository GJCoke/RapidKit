<script setup lang="tsx">
  import { computed, ref, watch, onBeforeUnmount } from "vue"
  import { NButton } from "naive-ui"
  import { useAppStore } from "@/store/modules/app"
  import { residentActionModel } from "@/hooks/business/table-actions/layout"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { tableScrollWidth } from "@/hooks/common/table-columns"
  import { useAuth } from "@/hooks/business/auth"
  import { PAGE_SIZE_OPTIONS } from "@/constants/pagination"
  import { fetchTaskStatsByName } from "@/service/api"
  import { $t } from "@/locales"

  const { getActionContext } = useAuth()

  const appStore = useAppStore()

  defineOptions({ name: "TaskGroups" })
  const props = defineProps<{ query: Api.Worker.TaskGroupQuery }>()
  const emit = defineEmits<{ drill: [taskName: string, failure: boolean]; page: [page: number]; pageSize: [size: number]; refresh: [] }>()
  const data = ref<Api.Worker.TaskGroupItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  let requestId = 0
  async function refresh() {
    const id = ++requestId
    loading.value = true
    const { data: result, error } = await fetchTaskStatsByName({ ...props.query })
    if (id !== requestId) return
    loading.value = false
    if (!error && result) { data.value = result.records; total.value = result.total }
  }
  watch(() => props.query, () => { data.value = []; refresh() }, { deep: true, immediate: true })
  onBeforeUnmount(() => { requestId++ })
  const pagination = computed(() => ({ page: props.query.page, pageSize: props.query.pageSize, itemCount: total.value, showSizePicker: true, pageSizes: [...PAGE_SIZE_OPTIONS], onUpdatePage: (page: number) => emit('page', page), onUpdatePageSize: (size: number) => emit('pageSize', size) }))
  const actions = useTableActions(() => residentActionModel<Api.Worker.TaskGroupItem>({ viewRecords: $t("page.manage.worker.viewRecords") }), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.taskName)
  const columns = computed<import('naive-ui').DataTableColumns<Api.Worker.TaskGroupItem>>(() => [
    { key: 'taskName', title: $t('page.manage.worker.taskName'), minWidth: 260, ellipsis: { tooltip: true } },
    { key: 'total', title: $t('page.manage.worker.groupTotal'), width: 100, render: row => <NButton text type="primary" onClick={() => emit('drill', row.taskName, false)}>{row.total}</NButton> },
    { key: 'success', title: $t('page.manage.worker.groupSuccess'), width: 100 },
    { key: 'failure', title: $t('page.manage.worker.groupFailure'), width: 100, render: row => <NButton text type="error" onClick={() => emit('drill', row.taskName, true)}>{row.failure}</NButton> },
    { key: 'inProgress', title: $t('page.manage.worker.groupInProgress'), width: 100 },
    { key: 'successRate', title: $t('page.manage.worker.groupSuccessRate'), width: 110, render: row => row.successRate === null ? '—' : `${row.successRate.toFixed(1)}%` },
    { key: 'lastExecutedAt', title: $t('page.manage.worker.groupLastExecuted'), width: 190, render: row => row.lastExecutedAt ? new Date(row.lastExecutedAt).toLocaleString() : '—' },
    ...actions.column({ key: 'operate', title: $t('common.operate'), render: row => <NButton size="small" onClick={() => emit('drill', row.taskName, false)}>{$t('page.manage.worker.viewRecords')}</NButton> }),
  ])
  const scrollX = computed(() => tableScrollWidth(columns.value))
  defineExpose({ refresh })
</script>

<template>
  <NCard
    :title="$t('page.manage.worker.groupsView')"
    :bordered="false"
    class="card-wrapper sm:flex-1-hidden"
    content-class="min-h-0 flex-col-stretch"
    size="small"
  >
    <template #header-extra>
      <TableHeaderOperation :loading="loading" :show-column-setting="false" @refresh="emit('refresh')" />
    </template>
    <NDataTable
      :columns="columns"
      :data="data"
      :loading="loading"
      :pagination="pagination"
      :row-key="(row) => row.taskName"
      :scroll-x="scrollX"
      :flex-height="!appStore.isMobile"
      class="min-h-0 flex-1"
      remote
      size="small"
    />
  </NCard>
</template>
