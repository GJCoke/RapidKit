<script setup lang="ts">
  import { computed } from "vue"
  import type { DataTableColumns } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "PluginEvents" })

  const props = defineProps<{
    events: Api.Plugin.EventStats
    loading: boolean
  }>()

  const errorList = computed(() =>
    Object.entries(props.events.handlerErrors)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  )

  const errorColumns: DataTableColumns<{ name: string; count: number }> = [
    { title: "Event", key: "name" },
    {
      title: "Count",
      key: "count",
      width: 80,
      align: "right",
      render: (row) => row.count,
    },
  ]

  const deadLetterColumns: DataTableColumns<Api.Plugin.DeadLetter> = [
    { title: "Event", key: "eventName" },
    {
      title: "Time",
      key: "timestamp",
      width: 160,
      render: (row) => {
        try {
          return new Date(row.timestamp).toLocaleString()
        } catch {
          return row.timestamp
        }
      },
    },
    {
      title: "Source",
      key: "source",
      width: 120,
      render: (row) => row.source ?? "-",
    },
  ]
</script>

<template>
  <NCard :bordered="false" class="card-wrapper">
    <div class="flex items-center gap-8px text-15px font-600 mb-12px">
      <SvgIcon icon="carbon:event-schedule" class="text-16px text-[var(--primary-color)]" />
      {{ $t("page.monitoring.plugin.eventStats") }}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-16px">
      <div>
        <div class="text-14px font-600 mb-8px">
          {{ $t("page.monitoring.plugin.handlerErrors") }}
        </div>
        <NEmpty v-if="!errorList.length" :description="$t('page.monitoring.plugin.noErrors')" class="py-24px" />
        <NDataTable
          v-else
          :columns="errorColumns"
          :data="errorList"
          :loading="loading"
          size="small"
          :bordered="false"
          :pagination="false"
        />
      </div>

      <div>
        <div class="text-14px font-600 mb-8px">
          {{ $t("page.monitoring.plugin.deadLetters") }}
          <span v-if="events.deadLetterCount > 0" class="text-12px text-[var(--text-color-3)] ml-4px">
            ({{ events.deadLetterCount }})
          </span>
        </div>
        <NEmpty
          v-if="!events.deadLetters.length"
          :description="$t('page.monitoring.plugin.noDeadLetters')"
          class="py-24px"
        />
        <NScrollbar v-else style="max-height: 240px">
          <NDataTable
            :columns="deadLetterColumns"
            :data="events.deadLetters"
            :loading="loading"
            size="small"
            :bordered="false"
            :pagination="false"
          />
        </NScrollbar>
      </div>
    </div>
  </NCard>
</template>
