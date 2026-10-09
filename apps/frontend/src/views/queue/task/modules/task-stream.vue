<script setup lang="tsx">
  import { computed, reactive, ref, watch, onBeforeUnmount } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { taskStatusRecord } from "@/constants/business"
  import { fetchGetTaskList, fetchRevokeTask } from "@/service/api"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"

  defineOptions({
    name: "TaskStream",
  })

  interface Emits {
    (e: "select", taskId: string): void
    (e: "refresh"): void
  }

  const emit = defineEmits<Emits>()
  const { hasAuth } = useAuth()

  const props = defineProps<{ filters: Omit<Api.Worker.TaskSearchParams, "page" | "pageSize">; resetKey: string }>()
  const searchParams = reactive({ page: 1, pageSize: 10 })
  const data = ref<Api.Worker.TaskListItem[]>([])
  const loading = ref(false)
  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const pagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100], onUpdatePage: (page: number) => { searchParams.page = page; pagination.page = page; getData() }, onUpdatePageSize: (size: number) => { searchParams.pageSize = size; pagination.pageSize = size; searchParams.page = 1; pagination.page = 1; getData() } })
  async function getData() {
    const id = ++requestId
    loading.value = true
    const { data: result, error } = await fetchGetTaskList({ ...props.filters, ...searchParams })
    if (id !== requestId) return
    loading.value = false
    if (!error && result) { data.value = result.records.map(row => ({ ...row, startedAt: row.startedAt ?? null, finishedAt: row.finishedAt ?? null, runtime: row.runtime ?? null })); pagination.itemCount = result.total }
  }
  let previousResetKey = props.resetKey
  watch(() => [props.filters, props.resetKey], () => {
    if (props.resetKey !== previousResetKey) { searchParams.page = 1; pagination.page = 1 }
    previousResetKey = props.resetKey
    data.value = []
    getData()
  }, { deep: true, immediate: true })
  onBeforeUnmount(() => { requestId++; clearTimeout(timer) })
  const columns = computed<import("naive-ui").DataTableColumns<Api.Worker.TaskListItem>>(() => [

      {
        key: "index",
        title: $t("common.index"),
        width: 64,
        align: "center",
        render: (_, index) => (searchParams.page - 1) * searchParams.pageSize + index + 1,
      },
      {
        key: "taskName",
        title: $t("page.manage.worker.taskName"),
        minWidth: 200,
        ellipsis: { tooltip: true },
      },
      {
        key: "status",
        title: $t("page.manage.worker.taskStatus"),
        align: "center",
        width: 100,
        render: (row) => {
          const tagMap: Record<Api.Worker.TaskStatus, NaiveUI.ThemeColor> = {
            "1": "default",
            "2": "info",
            "3": "success",
            "4": "error",
            "5": "warning",
            "6": "default",
          }
          const label = $t(taskStatusRecord[row.status])
          return <NTag type={tagMap[row.status]}>{label}</NTag>
        },
      },
      {
        key: "workerHostname",
        title: $t("page.manage.worker.workerHostname"),
        minWidth: 120,
        ellipsis: { tooltip: true },
      },
      {
        key: "runtime",
        title: $t("page.manage.worker.runtime"),
        width: 100,
        align: "center",
        render: (row) => (row.runtime !== null ? row.runtime.toFixed(2) : "-"),
      },
      {
        key: "startedAt",
        title: $t("page.manage.worker.startedAt"),
        width: 170,
        render: (row) => (row.startedAt ? new Date(row.startedAt).toLocaleString() : "-"),
      },
      {
        key: "retries",
        title: $t("page.manage.worker.retries"),
        width: 80,
        align: "center",
      },
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 150,
        render: (row) => (
          <div class="flex-center gap-8px">
            <NButton type="primary" ghost size="small" onClick={() => emit("select", row.taskId)}>
              {$t("common.detail")}
            </NButton>
            {hasAuth("queue_task:revoke") && (row.status === "1" || row.status === "2") && (
              <NPopconfirm onPositiveClick={() => handleRevoke(row.taskId)}>
                {{
                  default: () => $t("page.manage.worker.revokeConfirm"),
                  trigger: () => (
                    <NButton type="error" ghost size="small">
                      {$t("page.manage.worker.revokeTask")}
                    </NButton>
                  ),
                }}
              </NPopconfirm>
            )}
          </div>
        ),
      },
    ])

  async function handleRevoke(taskId: string) {
    const { error } = await fetchRevokeTask(taskId)
    if (!error) {
      window.$message?.success($t("page.manage.worker.revokeSuccess"))
      await getData()
    }
  }

  function handleTaskUpdate(_event: Api.Worker.TaskUpdateEvent) {
    clearTimeout(timer)
    timer = setTimeout(getData, 300)
  }

  defineExpose({ refresh: getData, handleTaskUpdate })
</script>

<template>
  <NCard :title="$t('page.manage.worker.taskStream')" :bordered="false" size="small" class="card-wrapper">
    <template #header-extra>
      <TableHeaderOperation :loading="loading" :show-column-setting="false" @refresh="emit('refresh')">
        <slot name="header-extra" />
      </TableHeaderOperation>
    </template>
    <NDataTable
      :columns="columns"
      :data="data"
      size="small"
      :scroll-x="960"
      :loading="loading"
      remote
      :row-key="(row) => row.id"
      :pagination="pagination"
    />
  </NCard>
</template>
