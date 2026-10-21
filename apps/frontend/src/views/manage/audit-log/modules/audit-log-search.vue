<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import dayjs from "dayjs"
  import utc from "dayjs/plugin/utc"
  import timezone from "dayjs/plugin/timezone"
  import { $t } from "@/locales"
  import { fetchGetAuditLogActors } from "@/service/api"

  defineOptions({ name: "AuditLogSearch" })
  dayjs.extend(utc)
  dayjs.extend(timezone)
  const props = defineProps<{ catalog: Api.SystemManage.AuditCatalog | null }>()
  const model = defineModel<Api.SystemManage.AuditLogQuery>("model", { required: true })
  const emit = defineEmits<{ search: []; range: [value: "24h" | "custom" | "all"] }>()
  const actors = ref<{ label: string; value: string }[]>([])
  const actorLoading = ref(false)
  let actorGeneration = 0
  const resources = computed(() => [
    ...new Map(
      (props.catalog?.actions || []).map((action) => [
        action.resourceType,
        { label: action.resourceLabel, value: action.resourceType },
      ]),
    ).values(),
  ])
  const actions = computed(() =>
    (props.catalog?.actions || [])
      .filter((action) => !model.value.resourceType || action.resourceType === model.value.resourceType)
      .map((action) => ({ label: `${action.label} · ${action.code}`, value: action.code })),
  )
  const results = computed(() =>
    ["success", "failure", "partial", "unknown"].map((value) => ({
      value,
      label: $t(`page.manage.auditLog.result.${value}` as any),
    })),
  )
  const displayZone = computed(() => props.catalog?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const timeRange = computed<[string, string] | null>({
    get: (): [string, string] | null =>
      model.value.startTime && model.value.endTime
        ? [
            dayjs(model.value.startTime).tz(displayZone.value).format("YYYY-MM-DD HH:mm:ss"),
            dayjs(model.value.endTime).tz(displayZone.value).format("YYYY-MM-DD HH:mm:ss"),
          ]
        : null,
    set: (value: [string, string] | null) => {
      model.value.startTime = value ? dayjs.tz(value[0], displayZone.value).toISOString() : undefined
      model.value.endTime = value ? dayjs.tz(value[1], displayZone.value).toISOString() : undefined
      emit("range", value ? "custom" : "all")
    },
  })
  function selectRange(value: "24h" | "today" | "7d" | "all") {
    const now = dayjs().tz(displayZone.value)
    model.value.startTime =
      value === "all"
        ? undefined
        : (value === "today" ? now.startOf("day") : now.subtract(value === "7d" ? 168 : 24, "hour")).toISOString()
    model.value.endTime = value === "all" ? undefined : now.toISOString()
    emit("range", value === "all" ? "all" : value === "24h" ? "24h" : "custom")
  }
  async function loadActors(keyword = "") {
    const generation = ++actorGeneration
    actorLoading.value = true
    const { data, error } = await fetchGetAuditLogActors({
      keyword,
      startTime: model.value.startTime,
      endTime: model.value.endTime,
    })
    if (generation !== actorGeneration) return
    actorLoading.value = false
    if (!error && data)
      actors.value = data.map((actor) => ({
        value: actor.id,
        label: `${actor.name || actor.username || actor.id}${actor.name && actor.username ? ` (${actor.username})` : ""}`,
      }))
  }
  function reset() {
    model.value = { page: 1, pageSize: model.value.pageSize || 20 }
    selectRange("24h")
    emit("search")
  }
  watch(
    () => [props.catalog, model.value.startTime, model.value.endTime],
    () => void loadActors(),
    { immediate: true },
  )
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <div class="mb-12px flex flex-wrap items-center gap-8px">
      <span class="font-600">{{ $t("page.manage.auditLog.timeRange") }}</span>
      <NButton
        v-for="range in ['24h', 'today', '7d', 'all'] as const"
        :key="range"
        size="small"
        quaternary
        @click="selectRange(range)"
        >{{ $t(`page.manage.auditLog.ranges.${range}` as any) }}</NButton
      >
      <span v-if="catalog" class="ml-auto text-12px text-base-text-3"
        >{{ $t("page.manage.auditLog.displayTimezone") }}: {{ catalog.timezone }}</span
      >
    </div>
    <NForm :model="model" label-placement="top" size="small">
      <NGrid :x-gap="16" cols="1 s:2 m:3 l:5" responsive="screen">
        <NFormItemGi :label="$t('page.manage.auditLog.timeRange')"
          ><NDatePicker
            v-model:formatted-value="timeRange"
            value-format="yyyy-MM-dd HH:mm:ss"
            type="datetimerange"
            clearable
            class="w-full"
        /></NFormItemGi>
        <NFormItemGi :label="$t('page.manage.auditLog.actor')"
          ><NSelect
            v-model:value="model.actorId"
            :options="actors"
            :loading="actorLoading"
            clearable
            filterable
            remote
            @search="loadActors"
        /></NFormItemGi>
        <NFormItemGi :label="$t('page.manage.auditLog.resourceType')"
          ><NSelect
            v-model:value="model.resourceType"
            :options="resources"
            filterable
            clearable
            @update:value="model.action = undefined"
        /></NFormItemGi>
        <NFormItemGi :label="$t('page.manage.auditLog.action')"
          ><NSelect v-model:value="model.action" :options="actions" filterable clearable
        /></NFormItemGi>
        <NFormItemGi :label="$t('page.manage.auditLog.resultLabel')"
          ><NSelect v-model:value="model.result" :options="results" clearable
        /></NFormItemGi>
      </NGrid>
      <NCollapse>
        <NCollapseItem :title="$t('page.manage.auditLog.advancedSearch')" name="advanced">
          <NGrid :x-gap="16" cols="1 s:2 l:4" responsive="screen">
            <NFormItemGi :label="$t('page.manage.auditLog.resourceName')"
              ><NInput v-model:value="model.resourceKeyword" clearable @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.resourceId')"
              ><NInput v-model:value="model.resourceId" clearable @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi label="Request ID"
              ><NInput v-model:value="model.requestId" clearable @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi label="Correlation ID"
              ><NInput v-model:value="model.correlationId" clearable @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.detail.subjectId')"
              ><NInput v-model:value="model.subjectUserId" clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.detail.sessionId')"
              ><NInput v-model:value="model.impersonationSessionId" clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.ip')"
              ><NInput v-model:value="model.ip" clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.actorAccount')"
              ><NInput v-model:value="model.actorKeyword" clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.riskLabel')"
              ><NSelect
                v-model:value="model.riskLevel"
                clearable
                :options="
                  (['normal', 'sensitive', 'critical'] as const).map((value) => ({
                    value,
                    label: $t(`page.manage.auditLog.risk.${value}` as any),
                  }))
                "
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.sourceLabel')"
              ><NSelect
                v-model:value="model.source"
                clearable
                :options="
                  (['http', 'domain_event', 'system'] as const).map((value) => ({
                    value,
                    label: $t(`page.manage.auditLog.source.${value}` as any),
                  }))
                "
            /></NFormItemGi>
          </NGrid>
        </NCollapseItem>
      </NCollapse>
      <NSpace justify="end" class="mt-12px"
        ><NButton @click="reset">{{ $t("common.reset") }}</NButton
        ><NButton type="primary" @click="emit('search')">{{ $t("common.search") }}</NButton></NSpace
      >
    </NForm>
  </NCard>
</template>
