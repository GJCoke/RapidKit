<script setup lang="ts">
  import { formatApiTime } from "@/utils/datetime"
  import { computed } from "vue"
  import { workerHealth } from "../composables/worker-detail"
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
    groups: Api.Worker.WorkerGroup[]
    history: boolean
  }

  interface Emits {
    (e: "select", worker: Api.Worker.WorkerInfo): void
    (e: "shutdown", worker: Api.Worker.WorkerInfo): void
    (e: "retire", worker: Api.Worker.WorkerInfo): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()
  const { hasAuth } = useAuth()

  const sections = computed(() => {
    const names = [
      ...new Set([...props.groups.map((group) => group.name), ...props.workers.map((worker) => worker.groupName)]),
    ]
    return names.map((name) => ({
      name,
      summary: props.groups.find((group) => group.name === name),
      workers: props.workers.filter((worker) => worker.groupName === name),
    }))
  })
  function online(worker: Api.Worker.WorkerInfo) {
    return worker.lifecycle !== "retired" && workerHealth(worker) === "online"
  }

  function handleClick(worker: Api.Worker.WorkerInfo) {
    emit("select", worker)
  }

  function formatTime(time: string, zone?: string) {
    if (!time) return "-"
    return formatApiTime(time, zone)
  }
</script>

<template>
  <NCard :title="$t('page.manage.worker.workerCards')" :bordered="false" size="small" class="card-wrapper">
    <NSpin :show="props.loading">
      <div v-if="sections.length === 0 && !props.loading" class="py-32px text-center text-gray-400">
        {{ $t("page.manage.worker.noWorkers") }}
      </div>
      <NCollapse v-else-if="sections.length" :default-expanded-names="sections.map((section) => section.name)">
        <NCollapseItem v-for="section in sections" :key="section.name" :name="section.name">
          <template #header>
            <div class="flex flex-wrap items-center gap-10px py-4px">
              <SvgIcon icon="carbon:group-resource" class="text-primary text-20px" />
              <span class="font-700">{{ section.name }}</span>
              <NTag
                v-if="section.summary"
                :type="
                  section.summary.missing ? 'warning' : section.summary.expectedReplicas === null ? 'info' : 'success'
                "
                size="small"
                :bordered="false"
              >
                {{
                  $t("page.manage.worker.groups.capacity", {
                    online: section.summary.online,
                    expected: section.summary.expectedReplicas ?? $t("page.manage.worker.groups.unknown"),
                  })
                }}
              </NTag>
              <NTag v-if="section.summary?.missing" size="small" type="warning">
                {{
                  $t(
                    section.summary.alerting
                      ? "page.manage.worker.groups.missing"
                      : "page.manage.worker.groups.starting",
                    { count: section.summary.missing },
                  )
                }}
              </NTag>
              <NTag v-if="section.summary?.draining" size="small">{{
                $t("page.manage.worker.groups.drainingCount", { count: section.summary.draining })
              }}</NTag>
            </div>
          </template>
          <div v-if="!section.workers.length" class="py-12px text-base-text-3">
            {{ $t("page.manage.worker.noWorkers") }}
          </div>
          <NGrid :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
            <NGridItem v-for="worker in section.workers" :key="worker.id" span="24 s:12 m:8 l:6">
              <NCard size="small" hoverable class="cursor-pointer" @click="handleClick(worker)">
                <div class="flex items-center gap-8px mb-8px">
                  <NBadge :type="online(worker) ? 'success' : 'default'" dot />
                  <span class="font-bold text-14px truncate">{{ worker.hostname }}</span>
                  <div class="ml-auto flex items-center gap-4px">
                    <NTag
                      :type="worker.lifecycle === 'retired' ? 'default' : online(worker) ? 'success' : 'warning'"
                      size="small"
                    >
                      {{
                        worker.lifecycle === "retired"
                          ? $t("page.manage.worker.groups.retired")
                          : worker.lifecycle === "draining"
                            ? $t("page.manage.worker.groups.draining")
                            : $t(workerStatusRecord[online(worker) ? "1" : "2"])
                      }}
                    </NTag>
                    <NPopconfirm
                      v-if="hasAuth('worker:control') && !history"
                      @positive-click.stop="emit('shutdown', worker)"
                    >
                      <template #trigger>
                        <NButton
                          size="tiny"
                          type="error"
                          quaternary
                          :aria-label="$t('page.manage.worker.control.shutdown')"
                          :disabled="!online(worker)"
                          @click.stop
                        >
                          <template #icon>
                            <icon-ic-round-power-settings-new class="text-icon" />
                          </template>
                        </NButton>
                      </template>
                      {{ $t("page.manage.worker.control.shutdownConfirm") }}
                    </NPopconfirm>
                    <NPopconfirm
                      v-if="!history && !online(worker) && hasAuth('worker:control')"
                      @positive-click.stop="emit('retire', worker)"
                    >
                      <template #trigger
                        ><NButton size="tiny" quaternary @click.stop>{{
                          $t("page.manage.worker.groups.retire")
                        }}</NButton></template
                      >
                      {{ $t("page.manage.worker.groups.retireConfirm") }}
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
                    <span class="text-11px">{{ formatTime(worker.lastHeartbeat, worker.timezone) }}</span>
                  </div>
                </div>
              </NCard>
            </NGridItem>
          </NGrid>
        </NCollapseItem>
      </NCollapse>
    </NSpin>
  </NCard>
</template>
