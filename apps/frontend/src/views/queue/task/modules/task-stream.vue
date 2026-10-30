<script setup lang="tsx">
  import { formatApiTime } from "@/utils/datetime"
  import { computed, reactive, ref, watch, onBeforeUnmount } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { useAppStore } from "@/store/modules/app"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { tableScrollWidth } from "@/hooks/common/table-columns"
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/constants/pagination"
  import { taskStatusRecord } from "@/constants/business"
  import { fetchGetTaskList, fetchRevokeTask } from "@/service/api"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { createTaskActionModel } from "./task-actions"

  const appStore = useAppStore()

  defineOptions({
    name: "TaskStream",
  })

  interface Emits {
    (e: "select", taskId: string): void
    (e: "refresh"): void
  }

  const emit = defineEmits<Emits>()
  const { hasAuth, getActionContext } = useAuth()

  const props = defineProps<{ filters: Omit<Api.Worker.TaskSearchParams, "page" | "pageSize">; resetKey: string }>()
  const searchParams = reactive({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
  const data = ref<Api.Worker.TaskListItem[]>([])
  const loading = ref(false)
  let requestId = 0
  const pagination = reactive({ page: 1, pageSize: DEFAULT_PAGE_SIZE, itemCount: 0, showSizePicker: true, pageSizes: [...PAGE_SIZE_OPTIONS], onUpdatePage: (page: number) => { searchParams.page = page; pagination.page = page; getData() }, onUpdatePageSize: (size: number) => { searchParams.pageSize = size; pagination.pageSize = size; searchParams.page = 1; pagination.page = 1; getData() } })
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
  onBeforeUnmount(() => { requestId++ })
  const actions = useTableActions(() => createTaskActionModel<Api.Worker.TaskListItem>(), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.taskId)
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
        render: (row) => (row.startedAt ? formatApiTime(row.startedAt) : "-"),
      },
      {
        key: "retries",
        title: $t("page.manage.worker.retries"),
        width: 80,
        align: "center",
      },
      ...actions.column({
        key: "operate",
        title: $t("common.operate"),
        render: (row) => (
          <div class="flex items-center justify-start flex-nowrap gap-8px whitespace-nowrap">
            <NButton type="primary" ghost size="small" onClick={() => emit("select", row.taskId)}>
              {$t("common.detail")}
            </NButton>
            {actions.visible(row, "revoke") && (
              <NPopconfirm onPositiveClick={() => actions.run(() => data.value.find((item) => item.taskId === row.taskId), "revoke", (latest) => handleRevoke(latest.taskId))}>
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
      }),
    ])

  const scrollX = computed(() => tableScrollWidth(columns.value))

  async function handleRevoke(taskId: string) {
    const { error } = await fetchRevokeTask(taskId)
    if (!error) {
      window.$message?.success($t("page.manage.worker.revokeSuccess"))
      await getData()
    }
  }

  defineExpose({ refresh: getData })
</script>

<template>
  <NCard
    :title="$t('page.manage.worker.taskStream')"
    :bordered="false"
    size="small"
    class="card-wrapper sm:flex-1-hidden"
    content-class="min-h-0 flex-col-stretch"
  >
    <template #header-extra>
      <TableHeaderOperation :loading="loading" :show-column-setting="false" @refresh="emit('refresh')">
        <slot name="header-extra" />
      </TableHeaderOperation>
    </template>
    <NDataTable
      :columns="columns"
      :data="data"
      size="small"
      :scroll-x="scrollX"
      :flex-height="!appStore.isMobile"
      class="min-h-0 flex-1"
      :loading="loading"
      remote
      :row-key="(row) => row.id"
      :pagination="pagination"
    />
  </NCard>
</template>
