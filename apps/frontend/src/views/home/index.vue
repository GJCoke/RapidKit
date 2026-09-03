<script setup lang="ts">
  import { computed, onMounted, type Component } from "vue"
  import { $t } from "@/locales"
  import { useAuthStore } from "@/store/modules/auth"
  import { selectDashboardModules } from "./dashboard-registry"
  import { useDashboard } from "./composables/use-dashboard"
  import { useHomePermissions } from "./composables/use-home-permissions"
  import ActivityFeed from "./modules/activity-feed.vue"
  import ApiOverview from "./modules/api-overview.vue"
  import AppStatus from "./modules/app-status.vue"
  import BusinessData from "./modules/business-data.vue"
  import InfrastructureOverview from "./modules/infrastructure-overview.vue"
  import OperationsOverview from "./modules/operations-overview.vue"
  import RestrictedHome from "./modules/restricted-home.vue"

  defineOptions({ name: "HomeDashboard" })

  type PresentationModule = {
    key: string
    order: number
    component: Component
    className: string
    props: () => Record<string, unknown>
    events?: Record<string, (...args: never[]) => void>
  }

  const dashboard = useDashboard()
  const authStore = useAuthStore()
  const displayName = computed(() => authStore.userInfo.name || authStore.userInfo.username || $t("route.home"))
  const formattedDate = computed(() =>
    new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(
      new Date(),
    ),
  )
  const registry = computed<PresentationModule[]>(() => [
    {
      key: "dashboard.overview",
      order: 10,
      component: OperationsOverview,
      className: "col-span-24 xl:col-span-15",
      props: () => ({
        data: dashboard.operationsOverview.value,
        range: dashboard.operationsRange.value,
        loading: dashboard.operationsLoading.value,
        error: dashboard.operationsError.value,
        onRangeChange: dashboard.onOperationsRangeChange,
        onRetry: dashboard.loadOperationsOverview,
      }),
    },
    {
      key: "dashboard.application-health",
      order: 20,
      component: AppStatus,
      className: "col-span-24 xl:col-span-9",
      props: () => ({
        healthStats: dashboard.healthStats.value,
        businessSummary: canShowBusinessSummary.value ? dashboard.businessSummary.value : null,
      }),
    },
    {
      key: "dashboard.activity",
      order: 40,
      component: ActivityFeed,
      className: "col-span-24 xl:col-span-15",
      props: () => ({
        activities: dashboard.activities.value,
        category: dashboard.activityCategory.value,
        onCategoryChange: dashboard.onActivityCategoryChange,
      }),
    },
    {
      key: "dashboard.business",
      order: 50,
      component: BusinessData,
      className: "col-span-24 xl:col-span-9",
      props: () => ({ businessSummary: dashboard.businessSummary.value }),
    },
    {
      key: "dashboard.infrastructure",
      order: 50,
      component: InfrastructureOverview,
      className: "col-span-24 xl:col-span-9",
      props: () => ({
        infrastructure: dashboard.infrastructure.value,
        resources: dashboard.resources.value,
        instanceResources: dashboard.instanceResources.value,
        selectedInstance: dashboard.selectedInstance.value,
        "onUpdate:selectedInstance": (value: string) => {
          dashboard.selectedInstance.value = value
        },
      }),
    },
    {
      key: "dashboard.api-monitoring",
      order: 70,
      component: ApiOverview,
      className: "col-span-24",
      props: () => ({
        distribution: dashboard.apiDistribution.value,
        topFailures: dashboard.apiTopFailures.value,
        trend: dashboard.apiTrend.value,
      }),
    },
  ])
  const knownKeys = registry.value.map((item) => item.key)
  const permissions = useHomePermissions(knownKeys)
  const permittedModules = computed(() => selectDashboardModules(registry.value, permissions.allowedModules.value))
  const canShowBusinessSummary = computed(() => permissions.allowedModules.value.includes("dashboard.business"))
  const activeModules = computed(() => {
    const hasApplicationHealth = permittedModules.value.some((item) => item.key === "dashboard.application-health")
    return hasApplicationHealth
      ? permittedModules.value.filter((item) => item.key !== "dashboard.business")
      : permittedModules.value
  })

  async function initializeHome() {
    await permissions.loadCapabilities()
    if (permissions.state.value !== "dashboard") return

    const keys = permittedModules.value.map((item) => item.key)
    await dashboard.loadModules(keys)
    if (authStore.userInfo.isAdmin) dashboard.setupSocket(keys)
  }

  onMounted(initializeHome)
</script>

<template>
  <div v-if="permissions.state.value === 'loading'" class="min-h-520px flex-center">
    <NSpin size="large" />
  </div>

  <div v-else-if="permissions.state.value === 'unavailable'" class="min-h-520px flex-col-center gap-16px">
    <NEmpty :description="$t('page.home.dashboard.permission.pageUnavailable')" />
    <NButton type="primary" @click="initializeHome">
      {{ $t("page.home.dashboard.permission.retry") }}
    </NButton>
  </div>

  <RestrictedHome v-else-if="permissions.state.value === 'restricted'" />

  <div v-else class="dashboard-shell flex flex-col gap-14px">
    <header class="dashboard-header flex flex-col gap-12px py-4px lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-x-12px gap-y-6px">
          <h1 class="m-0 text-24px font-700 tracking-tight">
            {{ $t("page.login.common.welcomeBack", { name: displayName }) }}
          </h1>
          <span class="inline-flex items-center gap-6px text-12px text-base-text-3">
            <span class="size-7px rd-full bg-success" />
            {{ $t("page.home.dashboard.healthy") }}
          </span>
        </div>
        <p class="m-0 mt-5px text-12px text-base-text-3">{{ formattedDate }} · Asia / Shanghai</p>
      </div>
    </header>

    <div class="grid grid-cols-24 gap-14px">
      <div v-for="module in activeModules" :key="module.key" :class="module.className" data-dashboard-module>
        <component :is="module.component" v-bind="module.props()" />
      </div>
    </div>
  </div>
</template>
