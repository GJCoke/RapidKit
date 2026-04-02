<script setup lang="ts">
  import { ref, onMounted } from "vue"
  import { useSocket } from "@/hooks/common/socket"
  import { $t } from "@/locales"
  import TaskStream from "./modules/task-stream.vue"
  import TaskDrawer from "./modules/task-drawer.vue"
  import TriggerModal from "./modules/trigger-modal.vue"

  defineOptions({
    name: "QueueTask",
  })

  // ==================== Task Drawer ====================
  const taskDrawerVisible = ref(false)
  const selectedTaskId = ref<string | null>(null)

  function handleTaskSelect(taskId: string) {
    selectedTaskId.value = taskId
    taskDrawerVisible.value = true
  }

  // ==================== Trigger Modal ====================
  const triggerModalVisible = ref(false)

  // ==================== Task Stream Ref ====================
  const taskStreamRef = ref<InstanceType<typeof TaskStream> | null>(null)

  function handleTaskSubmitted() {
    taskStreamRef.value?.refresh()
  }

  // ==================== Socket.IO ====================
  const { socket, connect } = useSocket()

  function setupSocket() {
    const baseUrl = import.meta.env.VITE_SERVICE_BASE_URL?.replace("/api/v1", "")

    connect({
      url: baseUrl,
      namespace: "/worker",
      path: "/socket.io",
    })

    socket.value?.on("task:update", (data: Api.Worker.TaskUpdateEvent) => {
      taskStreamRef.value?.handleTaskUpdate(data)
    })
  }

  // ==================== Lifecycle ====================
  onMounted(() => {
    setupSocket()
  })
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <TaskStream ref="taskStreamRef" @select="handleTaskSelect">
      <template #header-extra>
        <NButton type="primary" size="small" @click="triggerModalVisible = true">
          <template #icon>
            <icon-ic-round-play-arrow class="text-icon" />
          </template>
          {{ $t("page.manage.worker.triggerTask") }}
        </NButton>
      </template>
    </TaskStream>

    <TaskDrawer v-model:visible="taskDrawerVisible" :task-id="selectedTaskId" />
    <TriggerModal v-model:visible="triggerModalVisible" @submitted="handleTaskSubmitted" />
  </div>
</template>
