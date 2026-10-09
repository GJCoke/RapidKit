<script setup lang="tsx">
  import { computed, ref, watch, onBeforeUnmount } from "vue"
  import { NButton } from "naive-ui"
  import { fetchTaskStatsByName } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({ name: "TaskGroups" })
  const props = defineProps<{ query: Api.Worker.TaskGroupQuery }>()
  const emit = defineEmits<{ drill: [taskName: string, failure: boolean]; page: [page: number]; pageSize: [size: number]; refresh: [] }>()
  const data = ref<Api.Worker.TaskGroupItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  async function refresh() {
    const id = ++requestId
    loading.value = true
    const { data: result, error } = await fetchTaskStatsByName({ ...props.query })
    if (id !== requestId) return
    loading.value = false
    if (!error && result) { data.value = result.records; total.value = result.total }
  }
  watch(() => props.query, () => { data.value = []; refresh() }, { deep: true, immediate: true })
  function handleTaskUpdate() { clearTimeout(timer); timer = setTimeout(refresh, 300) }
  onBeforeUnmount(() => { requestId++; clearTimeout(timer) })
  const pagination = computed(() => ({ page: props.query.page, pageSize: props.query.pageSize, itemCount: total.value, showSizePicker: true, pageSizes: [10, 20, 50, 100], onUpdatePage: (page: number) => emit('page', page), onUpdatePageSize: (size: number) => emit('pageSize', size) }))
  const columns = computed<import('naive-ui').DataTableColumns<Api.Worker.TaskGroupItem>>(() => [
    { key: 'taskName', title: $t('page.manage.worker.taskName'), minWidth: 260, ellipsis: { tooltip: true } },
    { key: 'total', title: $t('page.manage.worker.groupTotal'), width: 100, render: row => <NButton text type="primary" onClick={() => emit('drill', row.taskName, false)}>{row.total}</NButton> },
    { key: 'success', title: $t('page.manage.worker.groupSuccess'), width: 100 },
    { key: 'failure', title: $t('page.manage.worker.groupFailure'), width: 100, render: row => <NButton text type="error" onClick={() => emit('drill', row.taskName, true)}>{row.failure}</NButton> },
    { key: 'inProgress', title: $t('page.manage.worker.groupInProgress'), width: 100 },
    { key: 'successRate', title: $t('page.manage.worker.groupSuccessRate'), width: 110, render: row => row.successRate === null ? '—' : `${row.successRate.toFixed(1)}%` },
    { key: 'lastExecutedAt', title: $t('page.manage.worker.groupLastExecuted'), width: 190, render: row => row.lastExecutedAt ? new Date(row.lastExecutedAt).toLocaleString() : '—' },
    { key: 'operate', title: $t('common.operate'), width: 130, render: row => <NButton size="small" onClick={() => emit('drill', row.taskName, false)}>{$t('page.manage.worker.viewRecords')}</NButton> },
  ])
  defineExpose({ refresh, handleTaskUpdate })
</script>

<template>
  <NCard :title="$t('page.manage.worker.groupsView')" :bordered="false" class="card-wrapper" size="small">
    <template #header-extra>
      <TableHeaderOperation :loading="loading" :show-column-setting="false" @refresh="emit('refresh')" />
    </template>
    <NDataTable
      :columns="columns"
      :data="data"
      :loading="loading"
      :pagination="pagination"
      :row-key="(row) => row.taskName"
      :scroll-x="1160"
      remote
      size="small"
    />
  </NCard>
</template>
