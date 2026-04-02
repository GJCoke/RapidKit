<script setup lang="ts">
  import { ref, computed, onMounted } from "vue"
  import { useSocket } from "@/hooks/common/socket"
  import { fetchGetAllWorkers, fetchShutdownWorker } from "@/service/api"
  import { $t } from "@/locales"
  import WorkerCards from "./modules/worker-cards.vue"
  import StatsPanel from "./modules/stats-panel.vue"
  import WorkerDrawer from "./modules/worker-drawer.vue"

  defineOptions({
    name: "QueueDashboard",
  })

  // ==================== Worker Cards ====================
  const workers = ref<Api.Worker.WorkerInfo[]>([])
  const workersLoading = ref(false)

  async function loadWorkers() {
    workersLoading.value = true
    const { data, error } = await fetchGetAllWorkers()
    if (!error) {
      workers.value = data
    }
    workersLoading.value = false
  }

  // ==================== Worker Drawer ====================
  const workerDrawerVisible = ref(false)
  const selectedWorkerId = ref<string | null>(null)
  const selectedWorker = computed(() => workers.value.find((w) => w.id === selectedWorkerId.value) || null)

  function handleWorkerSelect(worker: Api.Worker.WorkerInfo) {
    selectedWorkerId.value = worker.id
    workerDrawerVisible.value = true
  }

  async function handleShutdown(worker: Api.Worker.WorkerInfo) {
    const { error } = await fetchShutdownWorker(worker.id)
    if (!error) {
      window.$message?.success($t("page.manage.worker.control.shutdownSuccess"))
      loadWorkers()
    }
  }

  // ==================== Stats Panel ====================
  const statsPanelRef = ref<InstanceType<typeof StatsPanel> | null>(null)

  // ==================== Socket.IO ====================
  const { socket, connect } = useSocket()

  function setupSocket() {
    const baseUrl = import.meta.env.VITE_SERVICE_BASE_URL?.replace("/api/v1", "")

    connect({
      url: baseUrl,
      namespace: "/worker",
      path: "/socket.io",
    })

    socket.value?.on("worker:status", (data: Api.Worker.WorkerStatusEvent) => {
      const index = workers.value.findIndex((w) => w.hostname === data.hostname)
      if (index >= 0) {
        workers.value[index] = {
          ...workers.value[index],
          status: data.status,
          concurrency: data.concurrency,
          activeTaskCount: data.activeTaskCount,
          processedCount: data.processedCount,
          activeQueues: data.activeQueues,
          lastHeartbeat: data.lastHeartbeat,
        }
      } else {
        loadWorkers()
      }
    })

    socket.value?.on("task:update", (data: Api.Worker.TaskUpdateEvent) => {
      statsPanelRef.value?.handleTaskUpdate(data)
    })
  }

  // ==================== Lifecycle ====================
  onMounted(() => {
    loadWorkers()
    setupSocket()
  })
</script>

<template>
  <div class="flex-col-stretch gap-16px overflow-auto">
    <WorkerCards :workers="workers" :loading="workersLoading" @select="handleWorkerSelect" @shutdown="handleShutdown" />
    <StatsPanel ref="statsPanelRef" />
    <WorkerDrawer v-model:visible="workerDrawerVisible" :worker="selectedWorker" @updated="loadWorkers" />
  </div>
</template>
