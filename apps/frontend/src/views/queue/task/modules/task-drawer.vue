<script setup lang="ts">
  import { ref, watch } from "vue"
  import { taskStatusRecord } from "@/constants/business"
  import { fetchGetTaskDetail } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({
    name: "TaskDrawer",
  })

  interface Props {
    taskId: string | null
  }

  const props = defineProps<Props>()
  const visible = defineModel<boolean>("visible", { default: false })

  const loading = ref(false)
  const taskDetail = ref<Api.Worker.TaskInfo | null>(null)

  watch(visible, async (val) => {
    if (val && props.taskId) {
      loading.value = true
      const { data, error } = await fetchGetTaskDetail(props.taskId)
      if (!error) {
        taskDetail.value = data
      }
      loading.value = false
    } else {
      taskDetail.value = null
    }
  })

  function formatTime(time: string | null) {
    if (!time) return "-"
    return new Date(time).toLocaleString()
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  function formatJson(value: any) {
    if (!value) return "-"
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const tagTypeMap: Record<Api.Worker.TaskStatus, NaiveUI.ThemeColor> = {
    "1": "default",
    "2": "info",
    "3": "success",
    "4": "error",
    "5": "warning",
    "6": "default",
  }
</script>

<template>
  <NDrawer v-model:show="visible" :width="560">
    <NDrawerContent :title="$t('page.manage.worker.taskDetail')" closable>
      <NSpin :show="loading">
        <template v-if="taskDetail">
          <NDescriptions :column="1" label-placement="left" bordered size="small">
            <NDescriptionsItem :label="$t('page.manage.worker.taskId')">
              <NText code>{{ taskDetail.taskId }}</NText>
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.worker.taskName')">
              {{ taskDetail.taskName }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.worker.taskStatus')">
              <NTag :type="tagTypeMap[taskDetail.status]" size="small">
                {{ $t(taskStatusRecord[taskDetail.status]) }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.worker.workerHostname')">
              {{ taskDetail.workerHostname || "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.worker.runtime')">
              {{ taskDetail.runtime != null ? taskDetail.runtime.toFixed(2) + "s" : "-" }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.worker.retries')">
              {{ taskDetail.retries }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.worker.startedAt')">
              {{ formatTime(taskDetail.startedAt) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="$t('page.manage.worker.finishedAt')">
              {{ formatTime(taskDetail.finishedAt) }}
            </NDescriptionsItem>
          </NDescriptions>

          <NDivider />

          <div class="mb-8px font-bold">{{ $t("page.manage.worker.args") }}</div>
          <NCode :code="formatJson(taskDetail.args)" language="json" />

          <div class="mt-12px mb-8px font-bold">{{ $t("page.manage.worker.kwargs") }}</div>
          <NCode :code="formatJson(taskDetail.kwargs)" language="json" />

          <template v-if="taskDetail.result != null">
            <div class="mt-12px mb-8px font-bold">{{ $t("page.manage.worker.result") }}</div>
            <NCode :code="formatJson(taskDetail.result)" language="json" />
          </template>

          <template v-if="taskDetail.logs">
            <div class="mt-12px mb-8px font-bold">{{ $t("page.manage.worker.logs") }}</div>
            <NCode :code="taskDetail.logs" language="text" />
          </template>

          <template v-if="taskDetail.exception">
            <div class="mt-12px mb-8px font-bold text-red-500">{{ $t("page.manage.worker.exception") }}</div>
            <NAlert type="error" :bordered="false">
              {{ taskDetail.exception }}
            </NAlert>
          </template>

          <template v-if="taskDetail.traceback">
            <div class="mt-12px mb-8px font-bold text-red-500">{{ $t("page.manage.worker.traceback") }}</div>
            <NCode :code="taskDetail.traceback" language="python" class="bg-red-50 p-8px rounded" />
          </template>
        </template>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
