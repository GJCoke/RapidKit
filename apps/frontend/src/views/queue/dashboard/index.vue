<script setup lang="ts">
  import { ref, onMounted } from "vue"
  import { useSocket } from "@/hooks/common/socket"
  import { fetchGetAllWorkers } from "@/service/api"
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
  const selectedWorker = ref<Api.Worker.WorkerInfo | null>(null)

  function handleWorkerSelect(worker: Api.Worker.WorkerInfo) {
    selectedWorker.value = worker
    workerDrawerVisible.value = true
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

    socket.value?.on("worker:status", (data: Api.Worker.WorkerStatusEvent) => {
      const index = workers.value.findIndex((w) => w.hostname === data.hostname)
      if (index >= 0) {
        workers.value[index] = {
          ...workers.value[index],
          status: data.status,
          concurrency: data.concurrency,
          activeTaskCount: data.activeTaskCount,
          activeQueues: data.activeQueues,
          lastHeartbeat: data.lastHeartbeat,
        }
      } else {
        loadWorkers()
      }
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
    <WorkerCards :workers="workers" :loading="workersLoading" @select="handleWorkerSelect" />
    <StatsPanel />
    <WorkerDrawer v-model:visible="workerDrawerVisible" :worker="selectedWorker" @updated="loadWorkers" />
  </div>
</template>
