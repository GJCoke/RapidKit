<script setup lang="ts">
  import { computed, onUnmounted, reactive, ref, watch } from "vue"
  import { useWindowSize } from "@vueuse/core"
  import { useRouter } from "vue-router"
  import { fetchGetWorkerDetail } from "@/service/api/worker"
  import { useAuth } from "@/hooks/business/auth"
  import { $t } from "@/locales"
  import { workerCapacity, workerHealth } from "../composables/worker-detail"
  import { useWorkerInspection } from "../composables/use-worker-inspection"
  import WorkerTaskList from "./worker-task-list.vue"
  import WorkerEnvironment from "./worker-environment.vue"
  import WorkerControls from "./worker-controls.vue"

  defineOptions({ name: "WorkerDrawer" })
  const props = defineProps<{ worker: Api.Worker.WorkerInfo | null }>()
  const emit = defineEmits<{ updated: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const { hasAuth } = useAuth()
  const router = useRouter()
  const { width } = useWindowSize()
  const tab = ref("overview")
  const now = ref(Date.now())
  const timer = setInterval(() => {
    if (visible.value) now.value = Date.now()
  }, 5000)
  onUnmounted(() => {
    clearInterval(timer)
    detailRequest++
  })
  const health = computed(() => workerHealth(props.worker, now.value))
  const online = computed(() => health.value === "online")
  const runtime = reactive({
    concurrency: null as number | null,
    active: null as number | null,
    sampledAt: null as string | null,
  })
  const runtimeReady = computed(() => online.value && runtime.concurrency !== null && runtime.active !== null)
  const capacity = computed(() => workerCapacity(runtime.active ?? 0, runtime.concurrency ?? 0))
  const controlWorker = computed(() =>
    props.worker ? { ...props.worker, concurrency: runtime.concurrency ?? props.worker.concurrency } : null,
  )
  const subscriptionSnapshot = ref<string[] | null>(null)
  let detailRequest = 0
  async function loadSubscriptions() {
    const id = props.worker?.id
    if (!visible.value || !id) return
    const generation = ++detailRequest
    try {
      const { data, error } = await fetchGetWorkerDetail(id)
      if (generation !== detailRequest || !visible.value || id !== props.worker?.id) return
      if (!error && data) {
        const incoming = data.activeQueues.filter((queue): queue is string => typeof queue === "string")
        if (
          !subscriptionSnapshot.value ||
          incoming.length !== subscriptionSnapshot.value.length ||
          incoming.some((name, index) => name !== subscriptionSnapshot.value![index])
        )
          subscriptionSnapshot.value = incoming
        runtime.concurrency = data.runtimeConcurrency ?? null
        runtime.active = data.runtimeActiveTasks ?? null
        runtime.sampledAt = data.runtimeSampledAt ?? null
      }
    } catch {
      /* Existing snapshot is retained; empty inventory remains explicitly unknown. */
    }
  }
  const queues = computed(() =>
    (subscriptionSnapshot.value ?? props.worker?.activeQueues ?? []).filter(
      (queue): queue is string => typeof queue === "string",
    ),
  )
  const inspection = useWorkerInspection(
    () => props.worker,
    () => visible.value && tab.value === "tasks",
    () => online.value,
  )
  const metrics = computed(() => [
    {
      label: $t("page.manage.worker.detail.executing"),
      value: runtime.active,
      icon: "carbon:activity",
      hint: $t("page.manage.worker.detail.snapshotHint"),
    },
    {
      label: $t("page.manage.worker.concurrency"),
      value: runtime.concurrency,
      icon: "carbon:layers",
      hint: $t("page.manage.worker.detail.capacityHint"),
    },
    {
      label: $t("page.manage.worker.detail.processed"),
      value: props.worker?.processedCount,
      icon: "carbon:checkmark-outline",
      hint: $t("page.manage.worker.detail.processedHint"),
    },
  ])
  function formatTime(time?: string | null) {
    if (!time || !Number.isFinite(Date.parse(time))) return "—"
    return new Date(time).toLocaleString()
  }
  const runtimePoll = setInterval(() => {
    if (visible.value) void loadSubscriptions()
  }, 15000)
  onUnmounted(() => clearInterval(runtimePoll))
  function refresh() {
    emit("updated")
    void loadSubscriptions()
    void inspection.refresh()
  }
  function viewRecords() {
    if (!props.worker) return
    visible.value = false
    void router.push({ path: "/queue/task", query: { view: "records", worker: props.worker.hostname, range: "7d" } })
  }
  watch(
    [visible, () => props.worker?.id],
    () => {
      tab.value = "overview"
      now.value = Date.now()
      detailRequest++
      subscriptionSnapshot.value = null
      runtime.concurrency = runtime.active = null
      runtime.sampledAt = null
      if (visible.value) void loadSubscriptions()
    },
    { immediate: true },
  )
</script>

<template>
  <NDrawer v-model:show="visible" :width="Math.min(760, width)">
    <NDrawerContent :native-scrollbar="false" :title="$t('page.manage.worker.workerDetail')" closable>
      <div v-if="worker && visible" class="flex-col-stretch gap-16px">
        <div>
          <div class="flex flex-wrap items-center gap-8px">
            <NTag :type="online ? 'success' : 'warning'" :bordered="false" size="small">
              {{
                $t(
                  health === "online"
                    ? "page.manage.worker.status.online"
                    : health === "offline"
                      ? "page.manage.worker.status.offline"
                      : health === "stale"
                        ? "page.manage.worker.detail.heartbeatStale"
                        : "page.manage.worker.detail.heartbeatUnknown",
                )
              }}
            </NTag>
            <span class="text-12px text-base-text-3"
              >{{ $t("page.manage.worker.lastHeartbeat") }} {{ formatTime(worker.lastHeartbeat) }}</span
            >
          </div>
          <div class="mt-10px text-20px font-700 break-all">{{ worker.hostname }}</div>
          <div class="mt-12px flex items-center justify-between gap-12px">
            <NButton size="small" secondary type="primary" @click="viewRecords">
              <template #icon><SvgIcon icon="carbon:document" /></template>{{ $t("page.manage.worker.viewRecords") }}
            </NButton>
            <NButton size="small" quaternary @click="refresh"
              ><template #icon><SvgIcon icon="carbon:renew" /></template>{{ $t("common.refresh") }}</NButton
            >
          </div>
        </div>
        <div class="grid grid-cols-1 gap-10px sm:grid-cols-3">
          <div v-for="metric in metrics" :key="metric.label" class="rd-8px bg-theme-fill p-12px">
            <div class="flex items-center gap-6px text-12px text-base-text-2">
              <SvgIcon :icon="metric.icon" class="text-primary" />{{ metric.label }}
            </div>
            <div class="mt-6px text-28px font-700 tabular-nums">{{ metric.value?.toLocaleString() ?? "—" }}</div>
            <div class="mt-4px text-11px text-base-text-3">{{ metric.hint }}</div>
          </div>
        </div>
        <NAlert v-if="!online" type="warning" :bordered="false">{{
          $t("page.manage.worker.detail.staleSnapshot")
        }}</NAlert>
        <NTabs v-model:value="tab" type="line" animated>
          <NTabPane name="overview" :tab="$t('page.manage.worker.detail.overview')">
            <div class="flex-col-stretch gap-12px">
              <NCard
                :bordered="false"
                size="small"
                class="card-wrapper"
                :title="$t('page.manage.worker.overview.utilization')"
              >
                <div class="flex flex-wrap items-center gap-24px py-8px">
                  <NProgress
                    type="circle"
                    :percentage="runtimeReady && capacity.percent !== null ? Math.min(100, capacity.percent) : 0"
                    :status="capacity.overCapacity ? 'warning' : 'success'"
                    :stroke-width="10"
                    class="w-132px shrink-0"
                  >
                    <div class="text-center">
                      <div class="text-26px font-700 tabular-nums">
                        {{ runtimeReady && capacity.percent !== null ? `${Math.round(capacity.percent)}%` : "—" }}
                      </div>
                      <div class="mt-4px text-12px text-base-text-3">
                        {{ $t("page.manage.worker.detail.capacityUsed") }}
                      </div>
                    </div>
                  </NProgress>
                  <div class="min-w-160px flex-1 flex-col-stretch gap-10px">
                    <div class="flex justify-between text-14px">
                      <span>{{ $t("page.manage.worker.detail.executing") }}</span
                      ><strong class="text-primary tabular-nums">{{ runtimeReady ? runtime.active : "—" }}</strong>
                    </div>
                    <div class="flex justify-between text-14px">
                      <span>{{ $t("page.manage.worker.detail.available") }}</span
                      ><strong class="tabular-nums">{{ runtimeReady ? (capacity.available ?? "—") : "—" }}</strong>
                    </div>
                    <div class="text-12px text-base-text-3">{{ $t("page.manage.worker.detail.utilizationHint") }}</div>
                  </div>
                </div>
                <div class="mt-8px min-h-20px text-12px text-base-text-3">
                  {{
                    runtime.sampledAt
                      ? `${$t("page.manage.worker.detail.inspectedAt")} ${formatTime(runtime.sampledAt)}`
                      : $t("page.manage.worker.detail.runtimeUnknown")
                  }}
                </div>
                <NAlert v-if="capacity.overCapacity && runtimeReady" type="warning" :bordered="false" class="mt-12px">{{
                  $t("page.manage.worker.detail.overCapacity")
                }}</NAlert>
              </NCard>
              <NCard
                :bordered="false"
                size="small"
                class="card-wrapper"
                :title="$t('page.manage.worker.detail.subscriptions')"
              >
                <div v-if="queues.length" class="flex flex-wrap gap-8px">
                  <NTag v-for="queue in queues" :key="queue" :bordered="false" type="info" class="max-w-full"
                    ><span class="whitespace-normal break-all">{{ queue }}</span></NTag
                  >
                </div>
                <div v-else class="text-13px text-base-text-3">{{ $t("page.manage.worker.detail.queuesUnknown") }}</div>
                <div class="mt-12px text-12px text-base-text-3">
                  {{ $t("page.manage.worker.detail.queueSnapshotHint") }}
                </div>
              </NCard>
              <WorkerEnvironment :software="worker.softwareInfo" />
            </div>
          </NTabPane>
          <NTabPane name="tasks" :tab="$t('page.manage.worker.detail.taskScene')">
            <div class="flex-col-stretch gap-12px">
              <div class="text-12px text-base-text-3">{{ $t("page.manage.worker.detail.autoRefresh") }}</div>
              <WorkerTaskList
                v-for="kind in ['active', 'reserved'] as const"
                :key="kind"
                :kind="kind"
                :rows="inspection[kind].rows"
                :loading="inspection[kind].loading"
                :failed="inspection[kind].failed"
                :sampled-at="inspection[kind].sampledAt"
                :online="online"
                @refresh="inspection.refresh"
              />
            </div>
          </NTabPane>
          <NTabPane
            v-if="hasAuth('queue_dashboard:workerControl')"
            name="operations"
            :tab="$t('page.manage.worker.detail.operations')"
          >
            <WorkerControls
              v-if="controlWorker"
              :key="worker.id"
              :worker="controlWorker"
              :online="online"
              :queues="queues"
              @updated="refresh"
            />
          </NTabPane>
        </NTabs>
      </div>
      <NEmpty v-else-if="visible" :description="$t('page.manage.worker.detail.workerUnavailable')" />
    </NDrawerContent>
  </NDrawer>
</template>
