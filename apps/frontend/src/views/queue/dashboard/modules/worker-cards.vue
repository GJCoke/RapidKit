<script setup lang="ts">
  import { NPopconfirm } from "naive-ui"
  import { workerStatusRecord } from "@/constants/business"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"

  defineOptions({
    name: "WorkerCards",
  })

  interface Props {
    workers: Api.Worker.WorkerInfo[]
    loading: boolean
  }

  interface Emits {
    (e: "select", worker: Api.Worker.WorkerInfo): void
    (e: "shutdown", worker: Api.Worker.WorkerInfo): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()
  const { hasAuth } = useAuth()

  function handleClick(worker: Api.Worker.WorkerInfo) {
    emit("select", worker)
  }

  function formatTime(time: string) {
    if (!time) return "-"
    return new Date(time).toLocaleString()
  }
</script>

<template>
  <NCard :title="$t('page.manage.worker.workerCards')" :bordered="false" size="small" class="card-wrapper">
    <NSpin :show="props.loading">
      <div v-if="props.workers.length === 0 && !props.loading" class="py-32px text-center text-gray-400">
        {{ $t("page.manage.worker.noWorkers") }}
      </div>
      <NGrid v-else :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
        <NGridItem v-for="worker in props.workers" :key="worker.id" span="24 s:12 m:8 l:6">
          <NCard size="small" hoverable class="cursor-pointer" @click="handleClick(worker)">
            <div class="flex items-center gap-8px mb-8px">
              <NBadge :type="worker.status === '1' ? 'success' : 'default'" dot />
              <span class="font-bold text-14px truncate">{{ worker.hostname }}</span>
              <div class="ml-auto flex items-center gap-4px">
                <NTag :type="worker.status === '1' ? 'success' : 'warning'" size="small">
                  {{ $t(workerStatusRecord[worker.status]) }}
                </NTag>
                <NPopconfirm
                  v-if="hasAuth('queue_dashboard:workerControl')"
                  @positive-click.stop="emit('shutdown', worker)"
                >
                  <template #trigger>
                    <NButton size="tiny" type="error" quaternary :disabled="worker.status !== '1'" @click.stop>
                      <template #icon>
                        <icon-ic-round-power-settings-new class="text-icon" />
                      </template>
                    </NButton>
                  </template>
                  {{ $t("page.manage.worker.control.shutdownConfirm") }}
                </NPopconfirm>
              </div>
            </div>
            <div class="text-12px text-gray-500 space-y-4px">
              <div class="flex justify-between">
                <span>{{ $t("page.manage.worker.concurrency") }}</span>
                <span>{{ worker.concurrency }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ $t("page.manage.worker.activeTaskCount") }}</span>
                <NTag :type="worker.activeTaskCount > 0 ? 'info' : 'default'" size="small">
                  {{ worker.activeTaskCount }}
                </NTag>
              </div>
              <div class="flex justify-between">
                <span>{{ $t("page.manage.worker.processedCount") }}</span>
                <span>{{ worker.processedCount }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ $t("page.manage.worker.lastHeartbeat") }}</span>
                <span class="text-11px">{{ formatTime(worker.lastHeartbeat) }}</span>
              </div>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>
    </NSpin>
  </NCard>
</template>
