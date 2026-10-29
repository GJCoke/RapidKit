<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from "vue"
  import { useRouter } from "vue-router"
  import { fetchQueueDashboard, fetchTaskStatsByName, fetchTaskStatsByWorker } from "@/service/api"
  import { $t } from "@/locales"
  import { queueState, sortQueues, utilization } from "../composables/metrics"
  import { reconcileDashboard, reconcileRows } from "../composables/reconcile"
  import OverviewChart from "./overview-chart.vue"

  defineOptions({ name: "StatsPanel" })
  const props = withDefaults(defineProps<{ connected: boolean; active?: boolean }>(), { active: true })
  const emit = defineEmits<{ refreshWorkers: []; viewWorkers: [] }>()
  const router = useRouter()
  const days = ref(1)
  const dashboard = ref<Api.Worker.QueueDashboard | null>(null)
  const tasks = ref<Api.Worker.TaskGroupItem[]>([])
  const workerRanking = ref<Api.Worker.TaskStatsByWorker[]>([])
  const loading = ref(false)
  const failed = ref(false)
  const rankingFailed = ref(false)
  const now = ref(Date.now())
  const stale = computed(() => dashboard.value && now.value - new Date(dashboard.value.sampledAt).getTime() > 60000)
  const queues = computed(() => sortQueues(dashboard.value?.queues ?? []))
  const blocked = computed(() => queues.value.filter((row) => queueState(row) === "blocked"))
  const offline = computed(() => dashboard.value?.missingWorkers ?? 0)
  const attention = computed(
    () =>
      failed.value ||
      stale.value ||
      !dashboard.value ||
      (dashboard.value.onlineWorkers === 0 && !(dashboard.value.capacityKnown && dashboard.value.totalWorkers === 0)) ||
      offline.value > 0 ||
      blocked.value.length > 0 ||
      dashboard.value.queueDepth === null ||
      dashboard.value.queues.some((queue) => queue.consumers === null),
  )
  const occupied = computed(() => utilization(dashboard.value?.activeTasks ?? 0, dashboard.value?.concurrency ?? 0))
  const number = (value: number | null | undefined, digits = 2) =>
    value === null || value === undefined ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits })
  const metrics = computed(() => {
    const d = dashboard.value
    return [
      {
        label: $t("page.manage.worker.overview.depth"),
        value: number(d?.queueDepth),
        unit: "",
        icon: "carbon:query-queue",
        tone: blocked.value.length ? "text-warning" : "text-primary",
        hint: $t("page.manage.worker.overview.depthHint"),
        live: true,
      },
      {
        label: $t("page.manage.worker.overview.active"),
        value: number(d?.activeTasks),
        unit: "",
        icon: "carbon:activity",
        tone: "text-info",
        hint: $t("page.manage.worker.overview.capacity", { count: number(d?.concurrency) }),
        live: true,
      },
      {
        label: $t("page.manage.worker.overview.throughput"),
        value: number(d?.throughput),
        unit: $t("page.manage.worker.overview.perMinute"),
        icon: "carbon:meter",
        tone: "text-primary",
        hint: $t("page.manage.worker.overview.throughputHint"),
        live: true,
      },
      {
        label: $t("page.manage.worker.overview.successRate"),
        value: number(d?.successRate),
        unit: !d || d.successRate === null ? "" : "%",
        icon: "carbon:checkmark-outline",
        tone: "text-success",
        hint: d
          ? $t("page.manage.worker.overview.successHint", { success: number(d.success), failure: number(d.failure) })
          : $t("page.manage.worker.overview.noSamples"),
        live: false,
      },
      {
        label: $t("page.manage.worker.overview.p95"),
        value: number(d?.p95Runtime, 3),
        unit: !d || d.p95Runtime === null ? "" : "s",
        icon: "carbon:timer",
        tone: "text-base-text-1",
        hint:
          !d || d.avgRuntime === null
            ? $t("page.manage.worker.overview.noSamples")
            : $t("page.manage.worker.overview.avg", { value: number(d.avgRuntime, 3) }),
        live: false,
      },
    ]
  })
  let requestId = 0
  let disposed = false
  let debounce: ReturnType<typeof setTimeout> | undefined
  let pendingEvent = false
  let lastStarted = -Infinity

  async function loadStats(force = false) {
    if (disposed || !props.active) return
    if (!force && (loading.value || Date.now() - lastStarted < 30000)) return
    clearTimeout(debounce)
    debounce = undefined
    lastStarted = Date.now()
    const id = ++requestId
    const selectedDays = days.value
    const end = new Date()
    loading.value = true
    pendingEvent = false
    const results = await Promise.allSettled([
      fetchQueueDashboard({ days: selectedDays }),
      fetchTaskStatsByName({
        startTime: new Date(end.getTime() - selectedDays * 86400000).toISOString(),
        endTime: end.toISOString(),
        page: 1,
        pageSize: 10,
        sortBy: "total",
        sortOrder: "desc",
      }),
      fetchTaskStatsByWorker({ days: selectedDays }),
    ])
    if (disposed || id !== requestId) return
    const [overview, byName, byWorker] = results
    if (overview.status === "fulfilled" && !overview.value.error && overview.value.data) {
      if (dashboard.value) reconcileDashboard(dashboard.value, overview.value.data)
      else dashboard.value = overview.value.data
      failed.value = false
    } else failed.value = true
    rankingFailed.value =
      byName.status === "rejected" ||
      byWorker.status === "rejected" ||
      !!(byName.status === "fulfilled" && byName.value.error) ||
      !!(byWorker.status === "fulfilled" && byWorker.value.error)
    if (byName.status === "fulfilled" && !byName.value.error) {
      reconcileRows(tasks.value, byName.value.data.records, (row) => row.taskName)
    }
    if (byWorker.status === "fulfilled" && !byWorker.value.error) {
      const ranked = [...byWorker.value.data].sort((a, b) => b.total - a.total).slice(0, 10)
      reconcileRows(workerRanking.value, ranked, (row) => row.workerHostname)
    }
    now.value = Date.now()
    loading.value = false
    if (pendingEvent) scheduleRefresh()
  }
  function scheduleRefresh() {
    pendingEvent = true
    if (!props.active || loading.value || debounce) return
    debounce = setTimeout(
      () => {
        debounce = undefined
        if (!disposed) void loadStats()
      },
      Math.max(1500, 30000 - (Date.now() - lastStarted)),
    )
  }
  function refresh() {
    if (loading.value) return
    emit("refreshWorkers")
    void loadStats(true)
  }
  function handleTaskUpdate(_event?: Api.Worker.TaskUpdateEvent) {
    scheduleRefresh()
  }
  function viewRanking(kind: "tasks" | "workers", name: string) {
    const end = new Date()
    void router.push({
      path: "/queue/task",
      query: {
        view: "records",
        range: "custom",
        startTime: new Date(end.getTime() - days.value * 86400000).toISOString(),
        endTime: end.toISOString(),
        ...(kind === "tasks" ? { task: name } : { worker: name }),
      },
    })
  }
  function viewFailures() {
    void router.push({
      path: "/queue/task",
      query: {
        status: "4",
        startTime: new Date(Date.now() - days.value * 86400000).toISOString(),
        endTime: new Date().toISOString(),
        view: "records",
        range: "custom",
      },
    })
  }
  watch(days, () => {
    dashboard.value = null
    tasks.value = []
    workerRanking.value = []
    void loadStats(true)
  })
  watch(
    () => props.active,
    (active) => {
      if (active) void loadStats(true)
      else {
        clearTimeout(debounce)
        debounce = undefined
      }
    },
  )
  onMounted(() => {
    void loadStats()
  })
  onUnmounted(() => {
    disposed = true
    requestId++
    clearTimeout(debounce)
  })
  defineExpose({ handleTaskUpdate, refresh: loadStats })
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <NCard :bordered="false" class="card-wrapper">
      <div class="flex flex-wrap items-center justify-between gap-12px">
        <div>
          <div class="text-20px font-700">{{ $t("page.manage.worker.overview.title") }}</div>
          <div class="mt-4px text-13px text-base-text-3">{{ $t("page.manage.worker.overview.subtitle") }}</div>
        </div>
        <div class="flex flex-wrap items-center gap-12px">
          <NTag :type="connected ? 'success' : 'warning'" size="small" :bordered="false">
            {{ connected ? $t("page.manage.worker.overview.live") : $t("page.manage.worker.overview.disconnected") }}
          </NTag>
          <NRadioGroup v-model:value="days" size="small">
            <NRadioButton :value="1">{{ $t("page.manage.worker.stats.last24h") }}</NRadioButton>
            <NRadioButton :value="7">{{ $t("page.manage.worker.stats.last7d") }}</NRadioButton>
            <NRadioButton :value="30">{{ $t("page.manage.worker.stats.last30d") }}</NRadioButton>
          </NRadioGroup>
          <NButton size="small" :loading="loading" @click="refresh">
            <template #icon><SvgIcon icon="carbon:renew" /></template>
            {{ $t("page.manage.worker.overview.refresh") }}
          </NButton>
        </div>
      </div>
      <div
        class="mt-16px flex flex-wrap items-center gap-x-24px gap-y-8px border-t border-theme-default pt-12px text-12px text-base-text-3"
      >
        <NButton text size="small" @click="emit('viewWorkers')"
          >{{ $t("page.manage.worker.overview.workers") }}
          <span class="ml-8px font-700 tabular-nums"
            >{{ number(dashboard?.onlineWorkers) }} /
            {{
              dashboard?.capacityKnown ? number(dashboard.totalWorkers) : $t("page.manage.worker.groups.unknown")
            }}</span
          ></NButton
        >
        <span
          >{{ $t("page.manage.worker.overview.utilization") }}
          <strong class="ml-8px text-base-text-1 tabular-nums">{{
            occupied === null ? "—" : `${occupied}%`
          }}</strong></span
        >
        <span class="ml-auto"
          >{{ $t("page.manage.worker.overview.updated") }}
          {{ dashboard ? new Date(dashboard.sampledAt).toLocaleTimeString() : "—" }}</span
        >
      </div>
    </NCard>

    <NAlert
      :type="attention ? 'warning' : 'success'"
      :title="attention ? $t('page.manage.worker.overview.attention') : $t('page.manage.worker.overview.healthy')"
    >
      <div class="flex flex-wrap gap-x-24px gap-y-6px text-13px">
        <span v-if="failed">{{ $t("page.manage.worker.overview.unavailable") }}</span>
        <span v-if="stale">{{ $t("page.manage.worker.overview.stale") }}</span>
        <template v-if="dashboard">
          <span v-if="!dashboard.onlineWorkers">{{ $t("page.manage.worker.overview.noWorkers") }}</span>
          <NButton v-else-if="offline" text size="small" type="warning" @click="emit('viewWorkers')">{{
            $t("page.manage.worker.overview.offline", { count: offline })
          }}</NButton>
          <span v-for="queue in blocked" :key="queue.name">{{
            $t("page.manage.worker.overview.blocked", { name: queue.name, count: queue.depth })
          }}</span>
          <NButton v-if="dashboard.failure" text size="small" type="error" @click="viewFailures">{{
            $t("page.manage.worker.overview.failures", { count: dashboard.failure })
          }}</NButton>
          <span v-if="dashboard.queues.some((queue) => queue.consumers === null)">{{
            $t("page.manage.worker.overview.consumersUnknown")
          }}</span>
          <span v-if="dashboard.queueDepth === null">{{ $t("page.manage.worker.overview.brokerUnknown") }}</span>
        </template>
        <span v-if="!attention">{{ $t("page.manage.worker.overview.normalHint") }}</span>
      </div>
    </NAlert>

    <NSpin :show="loading && !dashboard">
      <div class="grid grid-cols-1 gap-12px sm:grid-cols-2 xl:grid-cols-5">
        <NCard v-for="metric in metrics" :key="metric.label" :bordered="false" class="card-wrapper" size="small">
          <div class="flex items-center justify-between gap-8px text-13px text-base-text-2">
            <span>{{ metric.label }}</span
            ><SvgIcon :icon="metric.icon" class="text-20px" :class="metric.tone" />
          </div>
          <div class="my-12px flex items-baseline gap-6px" :class="metric.tone">
            <span class="text-34px font-700 tabular-nums leading-tight">{{ metric.value }}</span
            ><span class="text-12px">{{ metric.unit }}</span>
          </div>
          <div class="min-h-32px text-12px text-base-text-3">{{ metric.hint }}</div>
          <NTag size="tiny" :bordered="false" class="mt-8px">{{
            metric.live ? $t("page.manage.worker.overview.current") : $t("page.manage.worker.overview.window")
          }}</NTag>
        </NCard>
      </div>
    </NSpin>

    <div class="grid grid-cols-1 gap-12px xl:grid-cols-5">
      <div class="xl:col-span-3">
        <NCard
          :bordered="false"
          class="card-wrapper h-full"
          :title="$t('page.manage.worker.overview.completionTrend')"
          size="small"
        >
          <div class="mb-8px text-12px text-base-text-3">{{ $t("page.manage.worker.overview.completionHint") }}</div>
          <OverviewChart v-if="dashboard?.timeline.length" kind="completion" :dashboard="dashboard" />
          <NEmpty v-else class="h-280px flex-center" :description="$t('page.manage.worker.overview.emptyTasks')" />
        </NCard>
      </div>
      <div class="xl:col-span-2">
        <NCard
          :bordered="false"
          class="card-wrapper h-full"
          :title="$t('page.manage.worker.overview.depthTrend')"
          size="small"
        >
          <div class="mb-8px text-12px text-base-text-3">
            {{ $t("page.manage.worker.overview.depthTrendHint") }} · {{ $t("page.manage.worker.overview.historyGap") }}
          </div>
          <OverviewChart v-if="dashboard?.depthTimeline.length" kind="depth" :dashboard="dashboard" />
          <NEmpty v-else class="h-280px flex-center" :description="$t('page.manage.worker.overview.emptyHistory')" />
        </NCard>
      </div>
    </div>

    <div class="grid grid-cols-1 items-stretch gap-12px xl:grid-cols-5">
      <div class="relative xl:min-h-280px xl:col-span-3">
        <NCard
          :bordered="false"
          class="card-wrapper queue-status-card xl:absolute xl:inset-0"
          :title="$t('page.manage.worker.overview.queues')"
          size="small"
        >
          <div class="queue-table-scroll min-h-0 flex-1 overflow-auto">
            <NTable :bordered="false" single-line size="small">
              <thead>
                <tr>
                  <th>{{ $t("page.manage.worker.overview.queueName") }}</th>
                  <th>{{ $t("page.manage.worker.overview.depth") }}</th>
                  <th>{{ $t("page.manage.worker.overview.consumers") }}</th>
                  <th>{{ $t("page.manage.worker.overview.state") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="queue in queues" :key="queue.name">
                  <td class="font-600 break-all">{{ queue.name }}</td>
                  <td class="font-700 tabular-nums" :class="queueState(queue) === 'blocked' ? 'text-warning' : ''">
                    {{ number(queue.depth) }}
                  </td>
                  <td class="tabular-nums">{{ number(queue.consumers) }}</td>
                  <td>
                    <NTag
                      size="small"
                      :bordered="false"
                      :type="
                        queueState(queue) === 'blocked' || queueState(queue) === 'unknown'
                          ? 'warning'
                          : queueState(queue) === 'healthy'
                            ? 'success'
                            : 'default'
                      "
                      >{{
                        queueState(queue) === "blocked"
                          ? $t("page.manage.worker.overview.queueBlocked")
                          : queueState(queue) === "unknown"
                            ? $t("page.manage.worker.overview.queueUnknown")
                            : queueState(queue) === "healthy"
                              ? $t("page.manage.worker.overview.queueHealthy")
                              : $t("page.manage.worker.overview.queueIdle")
                      }}</NTag
                    >
                  </td>
                </tr>
              </tbody>
            </NTable>
            <NEmpty v-if="!queues.length" class="py-24px" :description="$t('page.manage.worker.overview.noQueues')" />
          </div>
          <div class="mt-12px shrink-0 text-12px text-base-text-3">
            {{ $t("page.manage.worker.overview.queueNote") }}
          </div>
        </NCard>
      </div>
      <div class="xl:col-span-2">
        <NCard
          :bordered="false"
          class="card-wrapper h-full"
          :title="$t('page.manage.worker.overview.outcomes')"
          size="small"
        >
          <div class="flex-col-stretch gap-12px">
            <div class="flex justify-between">
              <span>{{ $t("page.manage.worker.overview.success") }}</span
              ><strong class="text-success tabular-nums">{{ number(dashboard?.success) }}</strong>
            </div>
            <div class="flex justify-between">
              <span>{{ $t("page.manage.worker.overview.failure") }}</span
              ><NButton text type="error" :disabled="!dashboard?.failure" @click="viewFailures"
                >{{ number(dashboard?.failure) }} <SvgIcon icon="carbon:arrow-up-right" class="ml-4px"
              /></NButton>
            </div>
            <div class="flex justify-between">
              <span>{{ $t("page.manage.worker.overview.retry") }}</span
              ><strong class="text-warning tabular-nums">{{ number(dashboard?.retry) }}</strong>
            </div>
            <div class="flex justify-between">
              <span>{{ $t("page.manage.worker.overview.revoked") }}</span
              ><strong class="tabular-nums">{{ number(dashboard?.revoked) }}</strong>
            </div>
            <NButton v-if="dashboard?.failure" size="small" secondary type="error" @click="viewFailures">{{
              $t("page.manage.worker.overview.viewFailures")
            }}</NButton>
            <div class="text-12px text-base-text-3">{{ $t("page.manage.worker.overview.retryHint") }}</div>
          </div>
        </NCard>
      </div>
    </div>

    <NGrid :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <NGridItem v-for="kind in ['tasks', 'workers'] as const" :key="kind" span="24 m:12">
        <NCard
          :bordered="false"
          class="card-wrapper"
          :title="
            kind === 'tasks'
              ? $t('page.manage.worker.overview.taskRanking')
              : $t('page.manage.worker.overview.workerRanking')
          "
          size="small"
        >
          <div class="mb-8px text-12px text-base-text-3">{{ $t("page.manage.worker.overview.rankingHint") }}</div>
          <div v-if="rankingFailed" class="mb-8px text-12px text-warning">
            {{ $t("page.manage.worker.overview.partial") }}
          </div>
          <OverviewChart
            v-if="kind === 'tasks' ? tasks.length : workerRanking.length"
            :kind="kind"
            :dashboard="dashboard"
            :tasks="tasks"
            :workers="workerRanking"
            @select="viewRanking(kind, $event)"
          />
          <NEmpty
            v-else
            class="h-280px flex-center"
            :description="
              rankingFailed ? $t('page.manage.worker.overview.partial') : $t('page.manage.worker.overview.noSamples')
            "
          />
        </NCard>
      </NGridItem>
    </NGrid>
  </div>
</template>

<style scoped>
  .queue-status-card :deep(.n-card-content) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .queue-table-scroll {
    max-height: 280px;
  }

  .queue-table-scroll :deep(th) {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  @media (min-width: 1280px) {
    .queue-table-scroll {
      max-height: none;
    }
  }
</style>
