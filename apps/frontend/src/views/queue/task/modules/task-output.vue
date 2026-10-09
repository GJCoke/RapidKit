<script setup lang="ts">
  import { $t } from "@/locales"
  import JsonViewer from "@/components/common/json-viewer/index.vue"
  import LogViewer from "@/components/common/log-viewer/index.vue"
  import TaskFailure from "./task-failure.vue"

  defineOptions({ name: "TaskOutput" })
  defineProps<{
    task: Pick<Api.Worker.TaskInfo, "taskId" | "status" | "exception" | "traceback" | "logs"> & { result?: unknown }
  }>()
</script>

<template>
  <div class="flex-col-stretch gap-16px min-w-0">
    <JsonViewer
      v-if="task.result != null"
      :key="`${task.taskId}-result`"
      :value="task.result"
      :title="$t('page.manage.worker.result')"
      :filename="`task-${task.taskId}-result.json`"
    />
    <TaskFailure
      :key="`${task.taskId}-failure`"
      :task-id="task.taskId"
      :status="task.status"
      :exception="task.exception"
      :traceback="task.traceback"
    />
    <LogViewer
      v-if="task.logs"
      :key="`${task.taskId}-logs`"
      :log="task.logs"
      :source-key="task.taskId"
      :title="$t('page.manage.worker.logs')"
      :filename="`task-${task.taskId}.log`"
    />
  </div>
</template>
