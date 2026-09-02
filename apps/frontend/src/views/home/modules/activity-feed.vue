<script setup lang="ts">
  import { computed, ref } from "vue"
  import dayjs from "dayjs"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardActivityFeed" })

  type Category = "all" | Api.Dashboard.ActivityCategory

  const props = defineProps<{
    activities: Api.Dashboard.ActivityItem[]
    category: Category
  }>()

  const emit = defineEmits<{
    categoryChange: [category: Category]
  }>()

  const showAllActivities = ref(false)
  const selectedActivity = ref<Api.Dashboard.ActivityItem | null>(null)

  const categories = [
    { value: "all", label: "page.home.dashboard.activityCategory.all" },
    { value: "task", label: "page.home.dashboard.activityCategory.task" },
    { value: "user", label: "page.home.dashboard.activityCategory.user" },
    { value: "system", label: "page.home.dashboard.activityCategory.system" },
    { value: "alert", label: "page.home.dashboard.activityCategory.alert" },
  ] as const

  const categoryType: Record<Api.Dashboard.ActivityCategory, "info" | "success" | "default" | "warning"> = {
    task: "info",
    user: "success",
    system: "default",
    alert: "warning",
  }

  const resultConfig: Record<
    Api.Dashboard.ActivityLevel,
    { label: string; type: "success" | "info" | "warning" | "error" }
  > = {
    success: { label: "page.home.dashboard.activityResult.success", type: "success" },
    info: { label: "page.home.dashboard.activityResult.info", type: "success" },
    warning: { label: "page.home.dashboard.activityResult.warning", type: "warning" },
    error: { label: "page.home.dashboard.activityResult.error", type: "error" },
  }

  const visibleActivities = computed(() => props.activities.slice(0, 5))

  function formatTitleParams(params: Api.Dashboard.ActivityItem["titleParams"]) {
    const duration = params.duration

    if (typeof duration !== "number" || !Number.isFinite(duration)) return params

    return { ...params, duration: Number(duration.toFixed(2)) }
  }

  function activityTitle(item: Api.Dashboard.ActivityItem) {
    return $t(item.titleKey as any, formatTitleParams(item.titleParams))
  }

  function activityDescription(item: Api.Dashboard.ActivityItem) {
    return item.descriptionKey ? $t(item.descriptionKey as any, item.descriptionParams) : ""
  }

  function actorName(item: Api.Dashboard.ActivityItem) {
    return item.actorName || "system"
  }

  function formatTime(time: string) {
    return dayjs(time).format("HH:mm:ss")
  }

  function formatDateTime(time: string) {
    return dayjs(time).format("YYYY-MM-DD HH:mm:ss")
  }

  function openActivityDetail(item: Api.Dashboard.ActivityItem) {
    selectedActivity.value = item
  }
</script>

<template>
  <section class="activity-card card-wrapper h-full overflow-hidden bg-container" aria-labelledby="recent-activity-title">
    <header class="activity-header flex flex-wrap items-center gap-12px px-18px pb-10px pt-15px">
      <h2 id="recent-activity-title" class="m-0 mr-10px text-16px font-700 text-base-text-1">
        {{ $t("page.home.dashboard.recentActivity") }}
      </h2>

      <div class="flex flex-wrap items-center gap-8px" role="group" :aria-label="$t('page.home.dashboard.activityFeed')">
        <NButton
          v-for="item in categories"
          :key="item.value"
          size="small"
          :type="category === item.value ? 'primary' : 'default'"
          :secondary="category === item.value"
          :aria-pressed="category === item.value"
          @click="emit('categoryChange', item.value)"
        >
          {{ $t(item.label as any) }}
        </NButton>
      </div>

      <NButton text type="primary" class="ml-auto font-600" @click="showAllActivities = true">
        {{ $t("page.home.dashboard.viewAllActivities") }}
        <SvgIcon icon="carbon:chevron-right" class="ml-2px text-icon-small text-primary" />
      </NButton>
    </header>

    <div class="activity-table" role="table">
      <div class="activity-row activity-table-head" role="row">
        <div role="columnheader">{{ $t("page.home.dashboard.activityTable.time") }}</div>
        <div role="columnheader">{{ $t("page.home.dashboard.activityTable.type") }}</div>
        <div role="columnheader">{{ $t("page.home.dashboard.activityTable.content") }}</div>
        <div class="activity-user" role="columnheader">{{ $t("page.home.dashboard.activityTable.user") }}</div>
        <div role="columnheader">{{ $t("page.home.dashboard.activityTable.result") }}</div>
        <div aria-hidden="true" />
      </div>

      <button
        v-for="item in visibleActivities"
        :key="item.id"
        type="button"
        class="activity-row activity-data-row w-full border-0 bg-transparent text-left"
        role="row"
        @click="openActivityDetail(item)"
      >
        <div class="flex items-center gap-12px tabular-nums" role="cell">
          <NBadge :type="resultConfig[item.level].type" dot />
          <span>{{ formatTime(item.occurredAt) }}</span>
        </div>
        <div role="cell">
          <NTag :type="categoryType[item.category]" size="small" :bordered="false">
            {{ $t(`page.home.dashboard.activityCategory.${item.category}` as any) }}
          </NTag>
        </div>
        <div class="min-w-0" role="cell">
          <p class="m-0 truncate text-base-text-1">{{ activityTitle(item) }}</p>
          <p v-if="activityDescription(item)" class="m-0 mt-2px truncate text-12px text-base-text-3">
            {{ activityDescription(item) }}
          </p>
        </div>
        <div class="activity-user truncate" role="cell">{{ actorName(item) }}</div>
        <div role="cell">
          <NText :type="resultConfig[item.level].type" strong>
            {{ $t(resultConfig[item.level].label as any) }}
          </NText>
        </div>
        <div class="flex justify-end" role="cell">
          <SvgIcon icon="carbon:chevron-right" class="text-16px text-base-text-3" />
        </div>
      </button>

      <div v-if="!visibleActivities.length" class="py-46px">
        <NEmpty :description="$t('page.home.dashboard.noActivity')" />
      </div>
    </div>
  </section>

  <NDrawer v-model:show="showAllActivities" width="min(760px, 92vw)" placement="right">
    <NDrawerContent :title="$t('page.home.dashboard.allActivities')" closable>
      <div class="activity-drawer flex flex-col">
        <button
          v-for="item in activities"
          :key="item.id"
          type="button"
          class="activity-drawer-row flex items-center gap-12px border-0 rd-8px bg-transparent px-10px py-10px text-left transition-colors hover:bg-theme-modal"
          @click="openActivityDetail(item)"
        >
          <NBadge :type="resultConfig[item.level].type" dot />
          <span class="w-66px shrink-0 tabular-nums text-12px text-base-text-3">{{ formatTime(item.occurredAt) }}</span>
          <NTag :type="categoryType[item.category]" size="small" :bordered="false">
            {{ $t(`page.home.dashboard.activityCategory.${item.category}` as any) }}
          </NTag>
          <span class="min-w-0 flex-1 truncate">{{ activityTitle(item) }}</span>
          <SvgIcon icon="carbon:chevron-right" class="shrink-0 text-base-text-3" />
        </button>
        <NEmpty v-if="!activities.length" :description="$t('page.home.dashboard.noActivity')" />
      </div>
    </NDrawerContent>
  </NDrawer>

  <NDrawer :show="Boolean(selectedActivity)" width="min(520px, 92vw)" placement="right" @update:show="!$event && (selectedActivity = null)">
    <NDrawerContent :title="$t('page.home.dashboard.activityDetails')" closable>
      <NDescriptions v-if="selectedActivity" :column="1" label-placement="left" bordered>
        <NDescriptionsItem :label="$t('page.home.dashboard.activityTable.time')">
          {{ formatDateTime(selectedActivity.occurredAt) }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.home.dashboard.activityTable.type')">
          <NTag :type="categoryType[selectedActivity.category]" size="small" :bordered="false">
            {{ $t(`page.home.dashboard.activityCategory.${selectedActivity.category}` as any) }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.home.dashboard.activityTable.content')">
          {{ activityTitle(selectedActivity) }}
          <p v-if="activityDescription(selectedActivity)" class="mb-0 mt-4px text-12px text-base-text-3">
            {{ activityDescription(selectedActivity) }}
          </p>
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.home.dashboard.activityTable.user')">
          {{ actorName(selectedActivity) }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.home.dashboard.activityTable.result')">
          <NText :type="resultConfig[selectedActivity.level].type" strong>
            {{ $t(resultConfig[selectedActivity.level].label as any) }}
          </NText>
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.home.dashboard.activityTable.eventCode')">
          <code class="break-all text-12px text-base-text-2">{{ selectedActivity.eventCode }}</code>
        </NDescriptionsItem>
      </NDescriptions>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
  .activity-card,
  .activity-drawer {
    --activity-divider: rgba(128, 128, 128, 0.16);
  }

  .activity-card {
    min-height: 306px;
  }

  .activity-drawer-row {
    box-shadow: inset 0 -1px 0 var(--activity-divider);
  }

  .activity-drawer-row:last-of-type {
    box-shadow: none;
  }

  .activity-table-head,
  .activity-data-row {
    display: grid;
    grid-template-columns: 105px 70px minmax(220px, 1fr) 120px 72px 20px;
    align-items: center;
  }

  .activity-table-head {
    min-height: 38px;
    padding: 0 18px;
    box-shadow: inset 0 -1px 0 var(--activity-divider);
    color: var(--text-color-2);
    font-size: 12px;
    font-weight: 600;
  }

  .activity-data-row {
    min-height: 47px;
    padding: 6px 18px;
    box-shadow: inset 0 -1px 0 var(--activity-divider);
    color: var(--text-color-2);
    font-size: 13px;
    cursor: pointer;
    transition: background-color 160ms ease;
  }

  .activity-data-row:last-child {
    box-shadow: none;
  }

  .activity-data-row:hover,
  .activity-data-row:focus-visible {
    background: var(--n-color-modal);
    outline: none;
  }

  @media (max-width: 768px) {
    .activity-header {
      align-items: flex-start;
    }

    .activity-header :deep(.n-button:last-child) {
      margin-left: 0;
    }

    .activity-table-head,
    .activity-data-row {
      grid-template-columns: 92px 62px minmax(150px, 1fr) 64px 18px;
    }

    .activity-user {
      display: none;
    }
  }
</style>
