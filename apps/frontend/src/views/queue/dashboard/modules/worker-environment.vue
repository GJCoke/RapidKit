<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"
  defineOptions({ name: "WorkerEnvironment" })
  const props = defineProps<{ software: Record<string, unknown> }>()
  const versions = computed(() => [
    { name: "Celery", value: props.software.celery_version, icon: "carbon:flow" },
    { name: "Python", value: props.software.python_version, icon: "carbon:code" },
  ])
  const extra = computed(() =>
    Object.entries(props.software).filter(([key]) => !["celery_version", "python_version", "platform"].includes(key)),
  )
  function format(value: unknown) {
    return value === undefined || value === null
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value)
  }
</script>

<template>
  <NCard :bordered="false" class="card-wrapper" size="small">
    <NCollapse>
      <NCollapseItem name="environment" :title="$t('page.manage.worker.detail.environment')">
        <NEmpty
          v-if="!Object.keys(software).length"
          :description="$t('page.manage.worker.detail.environmentUnknown')"
        />
        <div v-else class="flex-col-stretch gap-12px">
          <div class="grid grid-cols-1 gap-10px sm:grid-cols-2">
            <div
              v-for="version in versions"
              :key="version.name"
              class="flex items-center gap-12px rd-8px bg-theme-fill p-12px"
            >
              <div class="h-36px w-36px shrink-0 rd-8px flex-center text-22px text-primary">
                <SvgIcon :icon="version.icon" />
              </div>
              <div>
                <div class="text-12px text-base-text-3">{{ version.name }}</div>
                <div class="mt-4px font-mono text-18px font-600">{{ format(version.value) }}</div>
              </div>
            </div>
          </div>
          <div class="rd-8px bg-theme-fill p-12px">
            <div class="mb-6px flex items-center gap-6px text-12px text-base-text-3">
              <SvgIcon icon="carbon:bare-metal-server" />{{ $t("page.manage.worker.detail.platform") }}
            </div>
            <div class="font-mono text-12px leading-6 break-all">{{ format(software.platform) }}</div>
          </div>
          <div v-for="[key, value] in extra" :key="key" class="rd-8px bg-theme-fill p-12px">
            <div class="mb-6px text-12px text-base-text-3">{{ key }}</div>
            <pre class="whitespace-pre-wrap break-all font-mono text-12px">{{ format(value) }}</pre>
          </div>
        </div>
      </NCollapseItem>
    </NCollapse>
  </NCard>
</template>
