<script setup lang="ts">
  import { formatApiTime } from "@/utils/datetime"
  import { ref, watch } from "vue"
  import { taskStatusRecord } from "@/constants/business"
  import { fetchGetTaskDetail } from "@/service/api"
  import { $t } from "@/locales"
  import PythonArgumentsViewer from "@/components/common/python-arguments-viewer/index.vue"
  import TaskOutput from "./task-output.vue"

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

  function formatTime(time: string | null | undefined) {
    if (!time) return "-"
    return formatApiTime(time)
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

          <PythonArgumentsViewer
            :key="taskDetail.taskId"
            :args="taskDetail.args"
            :kwargs="taskDetail.kwargs"
            :function-name="taskDetail.taskName"
          />

          <TaskOutput :key="taskDetail.taskId" :task="taskDetail" class="mt-16px" />
        </template>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
