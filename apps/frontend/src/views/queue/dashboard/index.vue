<script setup lang="ts">
  import { ref, computed, onActivated, onDeactivated, onMounted, onUnmounted, watch } from "vue"
  import { useDocumentVisibility } from "@vueuse/core"
  import { useAppSocket } from "@/hooks/common/app-socket"
  import {
    fetchGetAllWorkers,
    fetchShutdownWorker,
    fetchWorkerGroups,
    fetchWorkerHistory,
    fetchRetireWorker,
  } from "@/service/api"
  import { $t } from "@/locales"
  import { reconcileRows } from "./composables/reconcile"
  import WorkerCards from "./modules/worker-cards.vue"
  import StatsPanel from "./modules/stats-panel.vue"
  import WorkerDrawer from "./modules/worker-drawer.vue"

  defineOptions({
    name: "QueueDashboard",
  })

  // ==================== Worker Cards ====================
  const workers = ref<Api.Worker.WorkerInfo[]>([])
  const workersLoading = ref(false)

  const groups = ref<Api.Worker.WorkerGroup[]>([])
  const history = ref<Api.Worker.WorkerInfo[]>([])
  const historyTotal = ref(0)
  const historyPage = ref(1)
  const view = ref<"current" | "history">("current")
  const documentVisibility = useDocumentVisibility()
  const pageActive = ref(true)
  const active = computed(() => pageActive.value && documentVisibility.value !== "hidden")
  let loadGeneration = 0
  let workerRequestKey = ""
  let pendingWorkers = false
  async function loadWorkers(force = false) {
    if (!active.value) return
    const key = `${view.value}:${historyPage.value}`
    if (workersLoading.value) {
      if (force || key !== workerRequestKey) pendingWorkers = true
      return
    }
    workerRequestKey = key
    const generation = ++loadGeneration
    workersLoading.value = true
    try {
      const [current, pools, archived] = await Promise.all([
        fetchGetAllWorkers(),
        fetchWorkerGroups(),
        view.value === "history" ? fetchWorkerHistory({ page: historyPage.value, pageSize: 24 }) : null,
      ])
      if (generation !== loadGeneration) return
      if (!current.error) reconcileRows(workers.value, current.data, (worker) => worker.id)
      if (!pools.error) groups.value = pools.data
      if (archived && !archived.error) {
        history.value = archived.data.records.map((worker) => ({
          ...worker,
          retiredAt: worker.retiredAt ?? null,
          lastHeartbeat: worker.lastHeartbeat ?? "",
          activeQueues: worker.activeQueues.filter((queue): queue is string => typeof queue === "string"),
        }))
        historyTotal.value = archived.data.total
      }
    } finally {
      if (generation === loadGeneration) workersLoading.value = false
      if (pendingWorkers) {
        pendingWorkers = false
        void loadWorkers()
      }
    }
  }
  watch(view, () => {
    historyPage.value = 1
    void loadWorkers()
  })
  watch(historyPage, () => {
    void loadWorkers()
  })
  async function handleRetire(worker: Api.Worker.WorkerInfo) {
    const { error } = await fetchRetireWorker(worker.id)
    if (!error) {
      await loadWorkers(true)
      statsPanelRef.value?.refresh()
    }
  }

  // ==================== Worker Drawer ====================
  const workerDrawerVisible = ref(false)
  const selectedWorkerId = ref<string | null>(null)
  const selectedWorker = computed(
    () => [...workers.value, ...history.value].find((w) => w.id === selectedWorkerId.value) || null,
  )

  function handleWorkerSelect(worker: Api.Worker.WorkerInfo) {
    selectedWorkerId.value = worker.id
    workerDrawerVisible.value = true
  }

  async function handleShutdown(worker: Api.Worker.WorkerInfo) {
    const { error } = await fetchShutdownWorker(worker.id)
    if (!error) {
      window.$message?.success($t("page.manage.worker.control.shutdownSuccess"))
      void loadWorkers(true)
    }
  }

  // ==================== Stats Panel ====================
  const statsPanelRef = ref<InstanceType<typeof StatsPanel> | null>(null)

  // ==================== Socket.IO ====================
  const { on, connect, isConnected } = useAppSocket()
  const workerSection = ref<HTMLElement | null>(null)

  function viewWorkers() {
    workerSection.value?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let connectedOnce = false
  watch(isConnected, (connected) => {
    if (!connected) return
    if (connectedOnce) {
      void loadWorkers()
      void statsPanelRef.value?.refresh()
    }
    connectedOnce = true
  })
  function setupSocket() {
    connect("/worker")

    on("worker:status", (data: Api.Worker.WorkerStatusEvent) => {
      const index = workers.value.findIndex((w) => w.hostname === data.hostname)
      const previous = workers.value[index]
      const changed = !previous || previous.status !== data.status || previous.lifecycle !== data.lifecycle
      if (index >= 0) {
        if (data.lifecycle === "retired") workers.value.splice(index, 1)
        else Object.assign(workers.value[index], data)
      }
      if (changed && active.value) {
        statsPanelRef.value?.handleTaskUpdate()
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          void loadWorkers(true)
        }, 250)
      }
    })

    on("task:update", (data: Api.Worker.TaskUpdateEvent) => {
      statsPanelRef.value?.handleTaskUpdate(data)
    })
  }

  // ==================== Lifecycle ====================
  onActivated(() => {
    pageActive.value = true
  })
  onDeactivated(() => {
    pageActive.value = false
  })
  watch(active, (visible) => {
    if (visible) void loadWorkers()
    else clearTimeout(refreshTimer)
  })
  onMounted(() => {
    loadWorkers()
    setupSocket()
    poll = setInterval(() => {
      if (!active.value) return
      void loadWorkers()
      void statsPanelRef.value?.refresh()
    }, 30000)
  })
  onUnmounted(() => {
    pageActive.value = false
    pendingWorkers = false
    loadGeneration++
    clearInterval(poll)
    clearTimeout(refreshTimer)
  })
</script>

<template>
  <div class="flex-col-stretch gap-16px overflow-auto">
    <StatsPanel
      ref="statsPanelRef"
      :connected="isConnected"
      :active="active"
      @refresh-workers="loadWorkers"
      @view-workers="viewWorkers"
    />
    <div ref="workerSection" class="space-y-12px">
      <NRadioGroup v-model:value="view" size="small">
        <NRadioButton value="current">{{ $t("page.manage.worker.groups.current") }}</NRadioButton>
        <NRadioButton value="history">{{ $t("page.manage.worker.groups.history") }}</NRadioButton>
      </NRadioGroup>
      <WorkerCards
        :workers="view === 'current' ? workers : history"
        :groups="view === 'current' ? groups : []"
        :history="view === 'history'"
        :loading="workersLoading"
        @select="handleWorkerSelect"
        @shutdown="handleShutdown"
        @retire="handleRetire"
      />
      <NPagination
        v-if="view === 'history' && historyTotal > 24"
        v-model:page="historyPage"
        :item-count="historyTotal"
        :page-size="24"
      />
    </div>
    <WorkerDrawer v-model:visible="workerDrawerVisible" :worker="selectedWorker" @updated="loadWorkers" />
  </div>
</template>
