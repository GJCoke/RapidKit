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
  import RestrictedHome from "./modules/restricted-home.vue"
  import StatCards from "./modules/stat-cards.vue"
  import TrendCharts from "./modules/trend-charts.vue"

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
  const registry = computed<PresentationModule[]>(() => [
    {
      key: "dashboard.overview",
      order: 10,
      component: StatCards,
      className: "col-span-24",
      props: () => ({
        userSummary: dashboard.userSummary.value,
        onlineUsers: dashboard.onlineUsers.value,
        workerCount: dashboard.workerCount.value,
        taskSummary: dashboard.taskSummary.value,
        errorStats: dashboard.errorStats.value,
      }),
    },
    {
      key: "dashboard.application-health",
      order: 20,
      component: AppStatus,
      className: "col-span-24",
      props: () => ({ healthStats: dashboard.healthStats.value }),
    },
    {
      key: "dashboard.infrastructure",
      order: 30,
      component: InfrastructureOverview,
      className: "col-span-24 md:col-span-16",
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
      key: "dashboard.business",
      order: 40,
      component: BusinessData,
      className: "col-span-24 md:col-span-8",
      props: () => ({ businessSummary: dashboard.businessSummary.value }),
    },
    {
      key: "dashboard.api-monitoring",
      order: 50,
      component: ApiOverview,
      className: "col-span-24",
      props: () => ({
        distribution: dashboard.apiDistribution.value,
        topFailures: dashboard.apiTopFailures.value,
        trend: dashboard.apiTrend.value,
      }),
    },
    {
      key: "dashboard.trends",
      order: 60,
      component: TrendCharts,
      className: "col-span-24 md:col-span-15",
      props: () => ({
        userTrend: dashboard.userTrend.value,
        trendRange: dashboard.trendRange.value,
        loading: dashboard.loading.userTrend,
        onRangeChange: dashboard.onTrendRangeChange,
      }),
    },
    {
      key: "dashboard.activity",
      order: 70,
      component: ActivityFeed,
      className: "col-span-24 min-h-400px md:col-span-9",
      props: () => ({ activities: dashboard.activities.value, auditDict: dashboard.auditDict.value }),
    },
  ])
  const knownKeys = registry.value.map(item => item.key)
  const permissions = useHomePermissions(knownKeys)
  const activeModules = computed(() => selectDashboardModules(registry.value, permissions.allowedModules.value))

  async function initializeHome() {
    await permissions.loadCapabilities()
    if (permissions.state.value !== "dashboard") return

    const keys = activeModules.value.map(item => item.key)
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

  <div v-else class="grid grid-cols-24 gap-16px">
    <div v-for="module in activeModules" :key="module.key" :class="module.className">
      <component :is="module.component" v-bind="module.props()" />
    </div>
  </div>
</template>
