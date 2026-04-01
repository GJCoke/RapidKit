<script setup lang="tsx">
  import { reactive } from "vue"
  import { NButton, NPopconfirm, NSwitch, NTag } from "naive-ui"
  import { fetchDeleteSchedule, fetchGetScheduleList, fetchToggleSchedule } from "@/service/api/worker"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import ScheduleOperateDrawer from "./modules/schedule-operate-drawer.vue"
  import ScheduleSearch from "./modules/schedule-search.vue"

  defineOptions({
    name: "QueueSchedule",
  })

  const appStore = useAppStore()

  const searchParams: Api.Worker.PeriodicTaskSearchParams = reactive({
    page: 1,
    pageSize: 10,
    enabled: undefined,
    taskName: undefined,
  })

  function formatScheduleDetail(row: Api.Worker.PeriodicTaskListItem): string {
    if (row.taskType === "interval" && row.interval) {
      const periodMap: Record<string, string> = {
        seconds: $t("page.manage.worker.schedule.periodOptions.seconds"),
        minutes: $t("page.manage.worker.schedule.periodOptions.minutes"),
        hours: $t("page.manage.worker.schedule.periodOptions.hours"),
        days: $t("page.manage.worker.schedule.periodOptions.days"),
        weeks: $t("page.manage.worker.schedule.periodOptions.weeks"),
      }
      return `${$t("page.manage.worker.schedule.every")} ${row.interval.every} ${periodMap[row.interval.period] || row.interval.period}`
    }
    if (row.taskType === "crontab" && row.crontab) {
      return `${row.crontab.minute} ${row.crontab.hour} ${row.crontab.dayOfMonth} ${row.crontab.monthOfYear} ${row.crontab.dayOfWeek}`
    }
    return "-"
  }

  const { columns, columnChecks, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetScheduleList(searchParams),
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
        key: "name",
        title: $t("page.manage.worker.schedule.name"),
        align: "center",
        minWidth: 140,
      },
      {
        key: "task",
        title: $t("page.manage.worker.schedule.task"),
        minWidth: 200,
        ellipsis: { tooltip: true },
      },
      {
        key: "taskType",
        title: $t("page.manage.worker.schedule.scheduleType"),
        align: "center",
        width: 120,
        render: (row) => {
          const typeMap: Record<Api.Worker.ScheduleType, { label: string; type: NaiveUI.ThemeColor }> = {
            interval: { label: $t("page.manage.worker.schedule.interval"), type: "info" },
            crontab: { label: $t("page.manage.worker.schedule.crontab"), type: "warning" },
          }
          const config = typeMap[row.taskType]
          return <NTag type={config.type}>{config.label}</NTag>
        },
      },
      {
        key: "scheduleDetail",
        title: $t("page.manage.worker.schedule.scheduleDetail"),
        minWidth: 180,
        render: (row) => <span class="font-mono text-xs">{formatScheduleDetail(row)}</span>,
      },
      {
        key: "enabled",
        title: $t("page.manage.worker.schedule.enabled"),
        align: "center",
        width: 100,
        render: (row) => <NSwitch value={row.enabled} onUpdateValue={() => handleToggle(row.id)} />,
      },
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 130,
        render: (row) => (
          <div class="flex-center gap-8px">
            <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
              {$t("common.edit")}
            </NButton>
            <NPopconfirm onPositiveClick={() => handleDelete(row.id)}>
              {{
                default: () => $t("page.manage.worker.schedule.deleteConfirm"),
                trigger: () => (
                  <NButton type="error" ghost size="small">
                    {$t("common.delete")}
                  </NButton>
                ),
              }}
            </NPopconfirm>
          </div>
        ),
      },
    ],
  })

  const { drawerVisible, operateType, editingData, handleAdd, handleEdit, checkedRowKeys, onDeleted } = useTableOperate(
    data,
    "id",
    getData,
  )

  async function handleToggle(id: string) {
    const { error } = await fetchToggleSchedule(id)
    if (!error) {
      window.$message?.success($t("page.manage.worker.schedule.toggleSuccess"))
      getData()
    }
  }

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteSchedule(id)
    if (!error) {
      window.$message?.success($t("page.manage.worker.schedule.deleteSuccess"))
      onDeleted()
    }
  }

  function edit(id: string) {
    handleEdit(id)
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ScheduleSearch v-model:model="searchParams" @search="getDataByPage" />
    <NCard
      :title="$t('page.manage.worker.schedule.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @add="handleAdd" @refresh="getData">
          <NButton size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
        </TableHeaderOperation>
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
      <ScheduleOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
    </NCard>
  </div>
</template>
