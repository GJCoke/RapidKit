<script setup lang="tsx">
  import { reactive } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { taskStatusRecord } from "@/constants/business"
  import { fetchGetTaskList, fetchRevokeTask } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable } from "@/hooks/common/table"
  import { translateOptions } from "@/utils/common"
  import { taskStatusOptions } from "@/constants/business"
  import { $t } from "@/locales"

  defineOptions({
    name: "TaskStream",
  })

  interface Emits {
    (e: "select", taskId: string): void
  }

  const emit = defineEmits<Emits>()
  const appStore = useAppStore()

  const searchParams: Api.Worker.TaskSearchParams = reactive({
    page: 1,
    pageSize: 10,
    status: undefined,
    taskName: undefined,
    workerHostname: undefined,
  })

  const { columns, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetTaskList(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page || 1
      searchParams.pageSize = params.pageSize || 10
    },
    columns: () => [
      {
        key: "index",
        title: $t("common.index"),
        width: 64,
        align: "center",
        render: (_, index) => index + 1,
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
            {(row.status === "1" || row.status === "2") && (
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
    ],
  })

  async function handleRevoke(taskId: string) {
    const { error } = await fetchRevokeTask(taskId)
    if (!error) {
      window.$message?.success($t("page.manage.worker.revokeSuccess"))
      await getData()
    }
  }

  function resetSearch() {
    searchParams.status = undefined
    searchParams.taskName = undefined
    searchParams.workerHostname = undefined
    getDataByPage()
  }

  function handleSearch() {
    getDataByPage()
  }

  /** expose refresh for parent to call when socket event arrives */
  defineExpose({ refresh: getData })
</script>

<template>
  <NCard
    :title="$t('page.manage.worker.taskStream')"
    :bordered="false"
    size="small"
    class="card-wrapper sm:flex-1-hidden"
  >
    <template #header-extra>
      <NSpace>
        <slot name="header-extra" />
        <NInput
          v-model:value="searchParams.taskName"
          :placeholder="$t('page.manage.worker.form.taskName')"
          size="small"
          clearable
          style="width: 160px"
        />
        <NSelect
          v-model:value="searchParams.status"
          :placeholder="$t('page.manage.worker.form.status')"
          :options="translateOptions(taskStatusOptions)"
          size="small"
          clearable
          style="width: 120px"
        />
        <NButton size="small" type="primary" ghost @click="handleSearch">
          <template #icon>
            <icon-ic-round-search class="text-icon" />
          </template>
        </NButton>
        <NButton size="small" @click="resetSearch">
          <template #icon>
            <icon-ic-round-refresh class="text-icon" />
          </template>
        </NButton>
      </NSpace>
    </template>
    <NDataTable
      :columns="columns"
      :data="data"
      size="small"
      :flex-height="!appStore.isMobile"
      :scroll-x="960"
      :loading="loading"
      remote
      :row-key="(row) => row.id"
      :pagination="mobilePagination"
      class="sm:h-full"
    />
  </NCard>
</template>
