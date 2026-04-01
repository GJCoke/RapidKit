<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { workerStatusRecord, workerStatusOptions } from "@/constants/business"
  import { fetchGetWorkerList, fetchPingWorker, fetchShutdownWorker } from "@/service/api/worker"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { translateOptions } from "@/utils/common"
  import { $t } from "@/locales"
  import WorkerDrawer from "../dashboard/modules/worker-drawer.vue"

  defineOptions({
    name: "QueueWorker",
  })

  const appStore = useAppStore()

  const searchParams: Api.Worker.WorkerSearchParams = reactive({
    page: 1,
    pageSize: 10,
    status: undefined,
    hostname: undefined,
  })

  function formatTime(time: string) {
    if (!time) return "-"
    return new Date(time).toLocaleString()
  }

  const { columns, columnChecks, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetWorkerList(searchParams),
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
        key: "hostname",
        title: $t("page.manage.worker.hostname"),
        minWidth: 180,
        ellipsis: { tooltip: true },
      },
      {
        key: "status",
        title: $t("page.manage.worker.workerStatus"),
        align: "center",
        width: 100,
        render: (row) => {
          const tagMap: Record<Api.Worker.WorkerStatus, NaiveUI.ThemeColor> = {
            "1": "success",
            "2": "warning",
          }
          return (
            <NTag type={tagMap[row.status]} size="small">
              {$t(workerStatusRecord[row.status])}
            </NTag>
          )
        },
      },
      {
        key: "concurrency",
        title: $t("page.manage.worker.concurrency"),
        align: "center",
        width: 90,
      },
      {
        key: "activeTaskCount",
        title: $t("page.manage.worker.activeTaskCount"),
        align: "center",
        width: 100,
        render: (row) => (
          <NTag type={row.activeTaskCount > 0 ? "info" : "default"} size="small">
            {row.activeTaskCount}
          </NTag>
        ),
      },
      {
        key: "processedCount",
        title: $t("page.manage.worker.processedCount"),
        align: "center",
        width: 100,
      },
      {
        key: "lastHeartbeat",
        title: $t("page.manage.worker.lastHeartbeat"),
        width: 180,
        render: (row) => <span class="text-12px">{formatTime(row.lastHeartbeat)}</span>,
      },
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 220,
        render: (row) => (
          <div class="flex-center gap-4px">
            <NButton size="small" quaternary type="info" onClick={() => handlePing(row)}>
              {$t("page.manage.worker.control.ping")}
            </NButton>
            <NButton size="small" quaternary type="primary" onClick={() => openWorkerDrawer(row)}>
              {$t("common.detail")}
            </NButton>
            <NPopconfirm onPositiveClick={() => handleShutdown(row)}>
              {{
                default: () => $t("page.manage.worker.control.shutdownConfirm"),
                trigger: () => (
                  <NButton size="small" quaternary type="error" disabled={row.status !== "1"}>
                    {$t("page.manage.worker.control.shutdown")}
                  </NButton>
                ),
              }}
            </NPopconfirm>
          </div>
        ),
      },
    ],
  })

  // ==================== Worker Drawer ====================
  const workerDrawerVisible = ref(false)
  const selectedWorker = ref<Api.Worker.WorkerInfo | null>(null)

  function openWorkerDrawer(worker: Api.Worker.WorkerInfo) {
    selectedWorker.value = worker
    workerDrawerVisible.value = true
  }

  // ==================== Worker Control ====================
  const pingLoading = ref(false)

  async function handlePing(worker: Api.Worker.WorkerInfo) {
    pingLoading.value = true
    const { data: result, error } = await fetchPingWorker(worker.id)
    pingLoading.value = false
    if (!error && result) {
      if (result.success) {
        window.$message?.success($t("page.manage.worker.control.pingSuccess"))
      } else {
        window.$message?.warning($t("page.manage.worker.control.pingFailed"))
      }
    }
  }

  async function handleShutdown(worker: Api.Worker.WorkerInfo) {
    const { error } = await fetchShutdownWorker(worker.id)
    if (!error) {
      window.$message?.success($t("page.manage.worker.control.shutdownSuccess"))
      getData()
    }
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard :bordered="false" size="small" class="card-wrapper">
      <NCollapse :default-expanded-names="['worker-search']">
        <NCollapseItem :title="$t('common.search')" name="worker-search">
          <NForm :model="searchParams" label-placement="left" :label-width="80">
            <NGrid responsive="screen" item-responsive>
              <NFormItemGi
                span="24 s:12 m:6"
                :label="$t('page.manage.worker.hostname')"
                path="hostname"
                class="pr-24px"
              >
                <NInput v-model:value="searchParams.hostname" :placeholder="$t('page.manage.worker.form.hostname')" />
              </NFormItemGi>
              <NFormItemGi
                span="24 s:12 m:6"
                :label="$t('page.manage.worker.workerStatus')"
                path="status"
                class="pr-24px"
              >
                <NSelect
                  v-model:value="searchParams.status"
                  :placeholder="$t('page.manage.worker.form.status')"
                  :options="translateOptions(workerStatusOptions)"
                  clearable
                />
              </NFormItemGi>
              <NFormItemGi span="24 s:12 m:6">
                <NSpace class="w-full" justify="end">
                  <NButton
                    @click="
                      () => {
                        ;((searchParams.hostname = undefined), (searchParams.status = undefined))
                      }
                    "
                  >
                    <template #icon>
                      <icon-ic-round-refresh class="text-icon" />
                    </template>
                    {{ $t("common.reset") }}
                  </NButton>
                  <NButton type="primary" ghost @click="() => getDataByPage()">
                    <template #icon>
                      <icon-ic-round-search class="text-icon" />
                    </template>
                    {{ $t("common.search") }}
                  </NButton>
                </NSpace>
              </NFormItemGi>
            </NGrid>
          </NForm>
        </NCollapseItem>
      </NCollapse>
    </NCard>

    <NCard :title="$t('page.manage.worker.title')" :bordered="false" size="small" class="card-wrapper sm:flex-1-hidden">
      <template #header-extra>
        <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
          <span />
        </TableHeaderOperation>
      </template>
      <NDataTable
        :columns="columns"
        :data="data"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="1080"
        :loading="loading"
        remote
        :row-key="(row: any) => row.id"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
    </NCard>

    <WorkerDrawer v-model:visible="workerDrawerVisible" :worker="selectedWorker" @updated="getData" />
  </div>
</template>
