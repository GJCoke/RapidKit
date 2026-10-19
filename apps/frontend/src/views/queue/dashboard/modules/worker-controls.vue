<script setup lang="ts">
  import { computed, onUnmounted, ref } from "vue"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import {
    fetchPingWorker,
    fetchPoolGrow,
    fetchPoolShrink,
    fetchAddQueue,
    fetchCancelQueue,
  } from "@/service/api/worker"
  import { validResize } from "../composables/worker-detail"
  defineOptions({ name: "WorkerControls" })
  const props = defineProps<{ worker: Api.Worker.WorkerInfo; online: boolean; queues: string[] }>()
  const emit = defineEmits<{ updated: [] }>()
  const { hasAuth } = useAuth()
  const increment = ref<number | null>(1)
  const queueName = ref("")
  const pending = ref<string | null>(null)
  const enabled = computed(() => hasAuth("worker:control") && props.online && !pending.value)
  let disposed = false
  onUnmounted(() => {
    disposed = true
  })
  async function run(action: string, request: (id: string) => ReturnType<typeof fetchPingWorker>) {
    if (!enabled.value) return
    const workerId = props.worker.id
    pending.value = action
    try {
      const { data, error } = await request(workerId)
      if (disposed || workerId !== props.worker.id) return
      if (!error && data) {
        if (!data.success) window.$message?.warning($t("page.manage.worker.detail.commandFailed"))
        else {
          window.$message?.success(
            $t(action === "ping" ? "page.manage.worker.control.pingSuccess" : "page.manage.worker.detail.commandSent"),
          )
          if (action === "add") queueName.value = ""
          emit("updated")
        }
      }
    } catch {
      if (!disposed && workerId === props.worker.id)
        window.$message?.warning($t("page.manage.worker.detail.commandFailed"))
    } finally {
      if (!disposed && workerId === props.worker.id) pending.value = null
    }
  }
  function resize(action: "grow" | "shrink") {
    const n = increment.value
    if (!validResize(n, props.worker.concurrency, action) || n === null) return
    void run(action, (id) => (action === "grow" ? fetchPoolGrow(id, { n }) : fetchPoolShrink(id, { n })))
  }
  function addQueue() {
    const queue = queueName.value.trim()
    if (!queue || props.queues.includes(queue)) return
    void run("add", (id) => fetchAddQueue(id, { queue }))
  }
</script>

<template>
  <div v-if="hasAuth('worker:control')" class="flex-col-stretch gap-12px">
    <NAlert v-if="!online" type="warning" :bordered="false">{{
      $t("page.manage.worker.detail.controlsOffline")
    }}</NAlert>
    <NCard :bordered="false" size="small" class="card-wrapper" :title="$t('page.manage.worker.detail.connectivity')">
      <div class="flex items-center justify-between gap-16px">
        <div class="text-13px text-base-text-3">{{ $t("page.manage.worker.detail.pingHint") }}</div>
        <NButton :loading="pending === 'ping'" :disabled="!enabled" @click="run('ping', fetchPingWorker)">{{
          $t("page.manage.worker.control.ping")
        }}</NButton>
      </div>
    </NCard>
    <NCard :bordered="false" size="small" class="card-wrapper" :title="$t('page.manage.worker.control.poolControl')">
      <div class="mb-12px text-13px text-base-text-3">{{ $t("page.manage.worker.detail.poolHint") }}</div>
      <div class="mb-12px text-13px">
        {{ $t("page.manage.worker.control.currentConcurrency") }}
        <strong class="ml-8px tabular-nums">{{ worker.concurrency }}</strong>
      </div>
      <div class="flex flex-wrap items-center gap-8px">
        <NInputNumber
          v-model:value="increment"
          :min="1"
          :max="10"
          :precision="0"
          :disabled="!enabled"
          class="w-100px"
          :aria-label="$t('page.manage.worker.control.processCount')"
        />
        <NButton
          type="primary"
          secondary
          :loading="pending === 'grow'"
          :disabled="!enabled || !validResize(increment, worker.concurrency, 'grow')"
          @click="resize('grow')"
          >{{ $t("page.manage.worker.control.poolGrow") }} +{{ increment ?? "—" }}</NButton
        >
        <NPopconfirm
          :disabled="!enabled || !validResize(increment, worker.concurrency, 'shrink')"
          @positive-click="resize('shrink')"
        >
          <template #trigger
            ><NButton
              type="warning"
              secondary
              :loading="pending === 'shrink'"
              :disabled="!enabled || !validResize(increment, worker.concurrency, 'shrink')"
              >{{ $t("page.manage.worker.control.poolShrink") }} −{{ increment ?? "—" }}</NButton
            ></template
          >
          {{ $t("page.manage.worker.detail.shrinkConfirm", { count: increment ?? 0 }) }}
        </NPopconfirm>
      </div>
    </NCard>
    <NCard :bordered="false" size="small" class="card-wrapper" :title="$t('page.manage.worker.detail.subscriptions')">
      <div class="mb-12px text-13px text-base-text-3">{{ $t("page.manage.worker.detail.subscriptionHint") }}</div>
      <div v-if="queues.length" class="mb-16px flex-col-stretch gap-8px">
        <div v-for="queue in queues" :key="queue" class="flex items-center justify-between gap-12px">
          <span class="font-mono text-13px break-all">{{ queue }}</span>
          <NPopconfirm :disabled="!enabled" @positive-click="run('cancel', (id) => fetchCancelQueue(id, { queue }))">
            <template #trigger
              ><NButton text type="warning" size="small" :disabled="!enabled" :loading="pending === 'cancel'">{{
                $t("page.manage.worker.detail.stopSubscription")
              }}</NButton></template
            >
            {{ $t("page.manage.worker.detail.cancelConfirm", { queue }) }}
          </NPopconfirm>
        </div>
      </div>
      <div v-else class="mb-12px text-13px text-base-text-3">{{ $t("page.manage.worker.detail.queuesUnknown") }}</div>
      <div class="flex flex-wrap items-center gap-8px">
        <NInput
          v-model:value="queueName"
          class="min-w-160px flex-1"
          :disabled="!enabled"
          :placeholder="$t('page.manage.worker.control.queuePlaceholder')"
          @keyup.enter="addQueue"
        />
        <NButton
          type="primary"
          secondary
          :loading="pending === 'add'"
          :disabled="!enabled || !queueName.trim() || queues.includes(queueName.trim())"
          @click="addQueue"
          >{{ $t("page.manage.worker.detail.subscribe") }}</NButton
        >
      </div>
    </NCard>
  </div>
</template>
