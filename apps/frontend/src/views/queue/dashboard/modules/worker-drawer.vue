<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { workerStatusRecord } from "@/constants/business"
  import { $t } from "@/locales"
  import {
    fetchPingWorker,
    fetchPoolGrow,
    fetchPoolShrink,
    fetchAddQueue,
    fetchCancelQueue,
    fetchActiveTasksOfWorker,
    fetchReservedTasksOfWorker,
  } from "@/service/api/worker"

  defineOptions({
    name: "WorkerDrawer",
  })

  interface Props {
    worker: Api.Worker.WorkerInfo | null
  }

  interface Emits {
    (e: "updated"): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()
  const visible = defineModel<boolean>("visible", { default: false })

  function formatTime(time: string) {
    if (!time) return "-"
    return new Date(time).toLocaleString()
  }

  const queues = computed(() => {
    return props.worker?.activeQueues || []
  })

  const softwareEntries = computed(() => {
    if (!props.worker?.softwareInfo) return []
    return Object.entries(props.worker.softwareInfo)
  })

  const isOnline = computed(() => props.worker?.status === "1")

  // ==================== Ping ====================
  const pingLoading = ref(false)

  async function handlePing() {
    if (!props.worker) return
    pingLoading.value = true
    const { data, error } = await fetchPingWorker(props.worker.id)
    pingLoading.value = false
    if (!error && data) {
      if (data.success) {
        window.$message?.success($t("page.manage.worker.control.pingSuccess"))
      } else {
        window.$message?.warning($t("page.manage.worker.control.pingFailed"))
      }
    }
  }

  // ==================== Pool Control ====================
  const poolResizeN = ref(1)
  const poolLoading = ref(false)

  async function handlePoolGrow() {
    if (!props.worker) return
    poolLoading.value = true
    const { error } = await fetchPoolGrow(props.worker.id, { n: poolResizeN.value })
    poolLoading.value = false
    if (!error) {
      window.$message?.success($t("page.manage.worker.control.poolResizeSuccess"))
      emit("updated")
    }
  }

  async function handlePoolShrink() {
    if (!props.worker) return
    poolLoading.value = true
    const { error } = await fetchPoolShrink(props.worker.id, { n: poolResizeN.value })
    poolLoading.value = false
    if (!error) {
      window.$message?.success($t("page.manage.worker.control.poolResizeSuccess"))
      emit("updated")
    }
  }

  // ==================== Queue Control ====================
  const newQueueName = ref("")
  const queueLoading = ref(false)

  async function handleAddQueue() {
    if (!props.worker || !newQueueName.value.trim()) return
    queueLoading.value = true
    const { error } = await fetchAddQueue(props.worker.id, { queue: newQueueName.value.trim() })
    queueLoading.value = false
    if (!error) {
      window.$message?.success($t("page.manage.worker.control.queueOperateSuccess"))
      newQueueName.value = ""
      emit("updated")
    }
  }

  async function handleCancelQueue(queue: string) {
    if (!props.worker) return
    queueLoading.value = true
    const { error } = await fetchCancelQueue(props.worker.id, { queue })
    queueLoading.value = false
    if (!error) {
      window.$message?.success($t("page.manage.worker.control.queueOperateSuccess"))
      emit("updated")
    }
  }

  // ==================== Active/Reserved Tasks ====================
  const activeTab = ref("info")
  const activeTasks = ref<Api.Worker.ActiveTaskInfo[]>([])
  const reservedTasks = ref<Api.Worker.ActiveTaskInfo[]>([])
  const tasksLoading = ref(false)

  async function loadActiveTasks() {
    if (!props.worker) return
    tasksLoading.value = true
    const { data, error } = await fetchActiveTasksOfWorker(props.worker.id)
    if (!error && data) {
      activeTasks.value = data
    }
    tasksLoading.value = false
  }

  async function loadReservedTasks() {
    if (!props.worker) return
    tasksLoading.value = true
    const { data, error } = await fetchReservedTasksOfWorker(props.worker.id)
    if (!error && data) {
      reservedTasks.value = data
    }
    tasksLoading.value = false
  }

  function handleTabChange(name: string | number) {
    if (name === "active") loadActiveTasks()
    else if (name === "reserved") loadReservedTasks()
  }

  // Reset state when drawer opens
  watch(visible, (val) => {
    if (val) {
      activeTab.value = "info"
      activeTasks.value = []
      reservedTasks.value = []
      poolResizeN.value = 1
      newQueueName.value = ""
    }
  })

  // Re-fetch active/reserved tasks when worker data changes (e.g. from socket)
  watch(
    () => props.worker?.activeTaskCount,
    () => {
      if (!visible.value || !props.worker) return
      if (activeTab.value === "active") loadActiveTasks()
      else if (activeTab.value === "reserved") loadReservedTasks()
    },
  )
</script>

<template>
  <NDrawer v-model:show="visible" :width="520">
    <NDrawerContent :title="$t('page.manage.worker.workerDetail')" closable>
      <template v-if="worker">
        <NTabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
          <!-- 基本信息 Tab -->
          <NTabPane name="info" :tab="$t('common.detail')">
            <NDescriptions :column="1" label-placement="left" bordered size="small">
              <NDescriptionsItem :label="$t('page.manage.worker.hostname')">
                {{ worker.hostname }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="$t('page.manage.worker.workerStatus')">
                <NTag :type="worker.status === '1' ? 'success' : 'warning'" size="small">
                  {{ $t(workerStatusRecord[worker.status]) }}
                </NTag>
              </NDescriptionsItem>
              <NDescriptionsItem :label="$t('page.manage.worker.concurrency')">
                {{ worker.concurrency }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="$t('page.manage.worker.activeTaskCount')">
                {{ worker.activeTaskCount }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="$t('page.manage.worker.processedCount')">
                {{ worker.processedCount }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="$t('page.manage.worker.lastHeartbeat')">
                {{ formatTime(worker.lastHeartbeat) }}
              </NDescriptionsItem>
            </NDescriptions>

            <NDivider />

            <div class="mb-8px font-bold">{{ $t("page.manage.worker.activeQueues") }}</div>
            <NSpace v-if="queues.length > 0">
              <NTag v-for="queue in queues" :key="queue" type="info" size="small">
                {{ queue }}
              </NTag>
            </NSpace>
            <span v-else class="text-gray-400">-</span>

            <NDivider />

            <div class="mb-8px font-bold">{{ $t("page.manage.worker.softwareInfo") }}</div>
            <NDescriptions v-if="softwareEntries.length > 0" :column="1" label-placement="left" bordered size="small">
              <NDescriptionsItem v-for="[key, value] in softwareEntries" :key="key" :label="key">
                {{ value }}
              </NDescriptionsItem>
            </NDescriptions>
            <span v-else class="text-gray-400">-</span>
          </NTabPane>

          <!-- 控制面板 Tab -->
          <NTabPane name="control" :tab="$t('page.manage.worker.control.poolControl')">
            <!-- Ping -->
            <div class="mb-16px">
              <NButton :loading="pingLoading" :disabled="!isOnline" @click="handlePing">
                {{ $t("page.manage.worker.control.ping") }}
              </NButton>
            </div>

            <NDivider />

            <!-- Pool 扩缩容 -->
            <div class="mb-8px font-bold">{{ $t("page.manage.worker.control.poolControl") }}</div>
            <div class="mb-8px text-12px text-gray-500">
              {{ $t("page.manage.worker.control.currentConcurrency") }}: {{ worker.concurrency }}
            </div>
            <NSpace align="center">
              <NInputNumber v-model:value="poolResizeN" :min="1" :max="10" size="small" class="w-80px" />
              <NButton type="primary" size="small" :loading="poolLoading" :disabled="!isOnline" @click="handlePoolGrow">
                +{{ poolResizeN }} {{ $t("page.manage.worker.control.poolGrow") }}
              </NButton>
              <NButton
                type="warning"
                size="small"
                :loading="poolLoading"
                :disabled="!isOnline"
                @click="handlePoolShrink"
              >
                -{{ poolResizeN }} {{ $t("page.manage.worker.control.poolShrink") }}
              </NButton>
            </NSpace>

            <NDivider />

            <!-- 队列管理 -->
            <div class="mb-8px font-bold">{{ $t("page.manage.worker.control.queueControl") }}</div>
            <div class="mb-8px">
              <NSpace v-if="queues.length > 0" class="mb-8px">
                <NTag
                  v-for="queue in queues"
                  :key="queue"
                  type="info"
                  size="small"
                  closable
                  :disabled="!isOnline"
                  @close="handleCancelQueue(queue)"
                >
                  {{ queue }}
                </NTag>
              </NSpace>
              <span v-else class="text-gray-400 text-12px">-</span>
            </div>
            <NSpace>
              <NInput
                v-model:value="newQueueName"
                :placeholder="$t('page.manage.worker.control.queuePlaceholder')"
                size="small"
                class="w-200px"
                @keyup.enter="handleAddQueue"
              />
              <NButton
                type="primary"
                size="small"
                :loading="queueLoading"
                :disabled="!isOnline || !newQueueName.trim()"
                @click="handleAddQueue"
              >
                {{ $t("page.manage.worker.control.addQueue") }}
              </NButton>
            </NSpace>
          </NTabPane>

          <!-- 活跃任务 Tab -->
          <NTabPane name="active" :tab="$t('page.manage.worker.control.activeTasks')">
            <NSpin :show="tasksLoading">
              <div v-if="activeTasks.length === 0 && !tasksLoading" class="py-32px text-center text-gray-400">
                {{ $t("page.manage.worker.control.noActiveTasks") }}
              </div>
              <NList v-else bordered>
                <NListItem v-for="task in activeTasks" :key="task.id">
                  <div class="text-13px">
                    <div class="font-bold mb-4px">{{ task.name }}</div>
                    <div class="text-gray-500 text-12px space-y-2px">
                      <div>
                        ID: <span class="font-mono">{{ task.id }}</span>
                      </div>
                      <div v-if="task.args">Args: {{ task.args }}</div>
                      <div v-if="task.kwargs">Kwargs: {{ task.kwargs }}</div>
                      <div v-if="task.workerPid">PID: {{ task.workerPid }}</div>
                    </div>
                  </div>
                </NListItem>
              </NList>
            </NSpin>
          </NTabPane>

          <!-- 预留任务 Tab -->
          <NTabPane name="reserved" :tab="$t('page.manage.worker.control.reservedTasks')">
            <NSpin :show="tasksLoading">
              <div v-if="reservedTasks.length === 0 && !tasksLoading" class="py-32px text-center text-gray-400">
                {{ $t("page.manage.worker.control.noActiveTasks") }}
              </div>
              <NList v-else bordered>
                <NListItem v-for="task in reservedTasks" :key="task.id">
                  <div class="text-13px">
                    <div class="font-bold mb-4px">{{ task.name }}</div>
                    <div class="text-gray-500 text-12px space-y-2px">
                      <div>
                        ID: <span class="font-mono">{{ task.id }}</span>
                      </div>
                      <div v-if="task.args">Args: {{ task.args }}</div>
                    </div>
                  </div>
                </NListItem>
              </NList>
            </NSpin>
          </NTabPane>
        </NTabs>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
