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
  const expandedNames = ref<string[]>([])
  watch(
    () => [
      model.value.requestId,
      model.value.resourceId,
      model.value.correlationId,
      model.value.impersonationSessionId,
      model.value.actorId,
      model.value.resourceType,
      model.value.action,
      model.value.resourceKeyword,
      model.value.actorKeyword,
      model.value.source,
      model.value.riskLevel,
      model.value.subjectUserId,
      model.value.ip,
    ],
    (values) => {
      if (values.some(Boolean)) expandedNames.value = ["advanced"]
    },
    { immediate: true },
  )
  const actors = ref<{ label: string; value: string }[]>([])
  const actorLoading = ref(false)
  const helpVisible = ref(false)
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
    emit("search")
  }
  function selectView(view: NonNullable<Api.SystemManage.AuditLogQuery["view"]>) {
    model.value.view = view
    emit("search")
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
    const now = dayjs()
    model.value = {
      page: 1,
      pageSize: model.value.pageSize || 20,
      startTime: now.subtract(24, "hour").toISOString(),
      endTime: now.toISOString(),
    }
    emit("range", "24h")
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
    <div class="mb-16px flex flex-wrap items-start justify-between gap-12px">
      <div>
        <h2 class="text-18px font-500">{{ $t("page.manage.auditLog.title") }}</h2>
        <p class="mt-4px text-base-text-2">{{ $t("page.manage.auditLog.introduction") }}</p>
      </div>
      <NButton size="small" @click="helpVisible = true">{{ $t("page.manage.auditLog.recordHelp") }}</NButton>
    </div>
    <div class="mb-16px flex flex-wrap gap-8px" role="group" :aria-label="$t('page.manage.auditLog.viewLabel')">
      <NButton
        v-for="view in ['all', 'attention', 'impersonation', 'system'] as const"
        :key="view"
        size="small"
        :type="(model.view || 'all') === view ? 'primary' : 'default'"
        secondary
        :aria-pressed="(model.view || 'all') === view"
        @click="selectView(view)"
      >
        {{ $t(`page.manage.auditLog.views.${view}` as any) }}
      </NButton>
    </div>
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
      <NGrid :x-gap="16" cols="1 m:3" responsive="screen">
        <NFormItemGi :label="$t('page.manage.auditLog.keyword')" label-placement="top" size="small">
          <NInput
            :value="model.keyword ?? null"
            :placeholder="$t('page.manage.auditLog.keywordPlaceholder')"
            :input-props="{ 'aria-label': $t('page.manage.auditLog.keyword') }"
            clearable
            :maxlength="200"
            @update:value="model.keyword = $event"
            @keyup.enter="emit('search')"
          />
        </NFormItemGi>

        <NFormItemGi :label="$t('page.manage.auditLog.timeRange')"
          ><NDatePicker
            v-model:formatted-value="timeRange"
            value-format="yyyy-MM-dd HH:mm:ss"
            type="datetimerange"
            clearable
            class="w-full"
        /></NFormItemGi>
        <NFormItemGi :label="$t('page.manage.auditLog.resultLabel')"
          ><NSelect :value="model.result ?? null" :options="results" clearable @update:value="model.result = $event"
        /></NFormItemGi>
      </NGrid>
      <NCollapse v-model:expanded-names="expandedNames">
        <NCollapseItem :title="$t('page.manage.auditLog.advancedSearch')" name="advanced">
          <NGrid :x-gap="16" cols="1 s:2 l:4" responsive="screen">
            <NFormItemGi :label="$t('page.manage.auditLog.actor')"
              ><NSelect
                :value="model.actorId ?? null"
                @update:value="model.actorId = $event"
                :options="actors"
                :loading="actorLoading"
                clearable
                filterable
                remote
                :input-props="{ 'aria-label': $t('page.manage.auditLog.actor') }"
                @search="loadActors"
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.resourceType')"
              ><NSelect
                :value="model.resourceType ?? null"
                :options="resources"
                filterable
                clearable
                :input-props="{ 'aria-label': $t('page.manage.auditLog.resourceType') }"
                @update:value="
                  (value) => {
                    model.resourceType = value
                    model.action = undefined
                  }
                "
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.action')"
              ><NSelect
                :value="model.action ?? null"
                :options="actions"
                filterable
                clearable
                :input-props="{ 'aria-label': $t('page.manage.auditLog.action') }"
                @update:value="model.action = $event"
            /></NFormItemGi>

            <NFormItemGi :label="$t('page.manage.auditLog.resourceName')"
              ><NInput
                :value="model.resourceKeyword ?? null"
                @update:value="model.resourceKeyword = $event"
                clearable
                @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.resourceId')"
              ><NInput
                :value="model.resourceId ?? null"
                @update:value="model.resourceId = $event"
                clearable
                @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi label="Request ID"
              ><NInput
                :value="model.requestId ?? null"
                @update:value="model.requestId = $event"
                clearable
                @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi label="Correlation ID"
              ><NInput
                :value="model.correlationId ?? null"
                @update:value="model.correlationId = $event"
                clearable
                @keyup.enter="emit('search')"
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.detail.subjectId')"
              ><NInput :value="model.subjectUserId ?? null" @update:value="model.subjectUserId = $event" clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.detail.sessionId')"
              ><NInput
                :value="model.impersonationSessionId ?? null"
                @update:value="model.impersonationSessionId = $event"
                clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.ip')"
              ><NInput :value="model.ip ?? null" @update:value="model.ip = $event" clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.actorAccount')"
              ><NInput :value="model.actorKeyword ?? null" @update:value="model.actorKeyword = $event" clearable
            /></NFormItemGi>
            <NFormItemGi :label="$t('page.manage.auditLog.riskLabel')"
              ><NSelect
                :value="model.riskLevel ?? null"
                @update:value="model.riskLevel = $event"
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
                :value="model.source ?? null"
                @update:value="model.source = $event"
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
    <NModal
      v-model:show="helpVisible"
      preset="card"
      :title="$t('page.manage.auditLog.recordHelp')"
      class="w-680px max-w-94vw"
    >
      <div class="flex-col gap-20px">
        <div v-for="topic in ['coverage', 'delay', 'results', 'risk', 'absence', 'privacy'] as const" :key="topic">
          <h3 class="mb-6px font-500">{{ $t(`page.manage.auditLog.help.${topic}.title` as any) }}</h3>
          <p class="text-base-text-2">{{ $t(`page.manage.auditLog.help.${topic}.text` as any) }}</p>
        </div>
      </div>
    </NModal>
  </NCard>
</template>
