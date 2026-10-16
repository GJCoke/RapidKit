<script setup lang="ts">
  import { $t } from "@/locales"
  defineOptions({ name: "WorkerTaskList" })
  defineProps<{
    kind: "active" | "reserved"
    rows: Api.Worker.ActiveTaskInfo[]
    loading: boolean
    failed: boolean
    sampledAt: number | null
    online: boolean
  }>()
  const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <NCard :bordered="false" class="card-wrapper" size="small">
    <template #header>
      <div class="flex items-center gap-8px">
        <SvgIcon :icon="kind === 'active' ? 'carbon:activity' : 'carbon:time'" class="text-primary" />
        <span class="text-15px font-600">{{
          $t(kind === "active" ? "page.manage.worker.detail.activeTitle" : "page.manage.worker.detail.reservedTitle")
        }}</span>
        <NTag size="small" :bordered="false">{{ sampledAt === null ? "—" : rows.length }}</NTag>
      </div>
    </template>
    <template #header-extra>
      <NButton
        secondary
        size="small"
        :loading="loading && sampledAt !== null"
        :disabled="!online || loading"
        class="min-w-80px"
        @click="emit('refresh')"
        ><template #icon><SvgIcon icon="carbon:renew" /></template>{{ $t("common.refresh") }}</NButton
      >
    </template>
    <div class="mb-12px text-12px text-base-text-3">
      {{ $t(kind === "active" ? "page.manage.worker.detail.activeHint" : "page.manage.worker.detail.reservedHint") }}
    </div>
    <NSpin :show="loading && sampledAt === null" :delay="200">
      <NScrollbar class="h-240px" content-class="pr-12px">
        <NAlert v-if="failed" type="warning" :bordered="false" class="mb-12px">
          {{
            $t(sampledAt ? "page.manage.worker.detail.inspectionStale" : "page.manage.worker.detail.inspectionFailed")
          }}
        </NAlert>
        <NEmpty v-if="!online" class="py-20px" :description="$t('page.manage.worker.detail.inspectionOffline')" />
        <NEmpty
          v-else-if="!rows.length && sampledAt !== null && !failed"
          class="py-20px"
          :description="
            $t(kind === 'active' ? 'page.manage.worker.detail.noActive' : 'page.manage.worker.detail.noReserved')
          "
        />
        <div v-else>
          <div v-for="task in rows" :key="task.id" class="border-b border-theme-naive py-12px last:border-b-0">
            <div class="text-14px font-600 break-all">{{ task.name }}</div>
            <div class="mt-4px font-mono text-12px text-base-text-3 break-all">{{ task.id }}</div>
            <div
              v-if="task.workerPid || task.timeStart"
              class="mt-6px flex flex-wrap gap-12px text-12px text-base-text-2"
            >
              <span v-if="task.workerPid">PID {{ task.workerPid }}</span>
              <span v-if="task.timeStart"
                >{{ $t("page.manage.worker.startedAt") }} {{ new Date(task.timeStart * 1000).toLocaleString() }}</span
              >
            </div>
            <NCollapse v-if="task.args || task.kwargs" class="mt-8px">
              <NCollapseItem :title="$t('page.manage.worker.detail.parameters')" :name="task.id">
                <div class="flex-col-stretch gap-8px text-12px">
                  <div v-if="task.args">
                    <span class="text-base-text-3">{{ $t("page.manage.worker.args") }}</span>
                    <pre class="mt-4px whitespace-pre-wrap break-all font-mono">{{ task.args }}</pre>
                  </div>
                  <div v-if="task.kwargs">
                    <span class="text-base-text-3">{{ $t("page.manage.worker.kwargs") }}</span>
                    <pre class="mt-4px whitespace-pre-wrap break-all font-mono">{{ task.kwargs }}</pre>
                  </div>
                </div>
              </NCollapseItem>
            </NCollapse>
          </div>
        </div>
      </NScrollbar>
    </NSpin>
    <div class="mt-12px text-12px text-base-text-3">{{ $t("page.manage.worker.detail.instantSnapshot") }}</div>
    <div class="mt-12px min-h-20px text-12px text-base-text-3">
      {{ $t("page.manage.worker.detail.inspectedAt") }}
      {{ sampledAt === null ? "—" : new Date(sampledAt).toLocaleTimeString() }}
    </div>
  </NCard>
</template>
