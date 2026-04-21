<script setup lang="ts">
  import { onMounted } from "vue"
  import { useDashboard } from "./composables/use-dashboard"
  import StatCards from "./modules/stat-cards.vue"
  import AppStatus from "./modules/app-status.vue"
  import InfraStatus from "./modules/infra-status.vue"
  import ServerResources from "./modules/server-resources.vue"
  import BusinessData from "./modules/business-data.vue"
  import ApiOverview from "./modules/api-overview.vue"
  import TrendCharts from "./modules/trend-charts.vue"
  import ActivityFeed from "./modules/activity-feed.vue"

  defineOptions({ name: "HomeDashboard" })

  const dashboard = useDashboard()

  onMounted(() => {
    dashboard.loadInitialData()
    dashboard.setupSocket()
  })
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <!-- Layer 1: Stat Cards -->
    <StatCards
      :user-summary="dashboard.userSummary.value"
      :online-users="dashboard.onlineUsers.value"
      :worker-count="dashboard.workerCount.value"
      :task-summary="dashboard.taskSummary.value"
      :error-stats="dashboard.errorStats.value"
    />

    <!-- Layer 2: App Status -->
    <AppStatus :health-stats="dashboard.healthStats.value" />

    <!-- Layer 3: Infrastructure | Server Resources | Business Data -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-16px">
      <InfraStatus :infrastructure="dashboard.infrastructure.value" />
      <ServerResources
        :resources="dashboard.resources.value"
        :instance-resources="dashboard.instanceResources.value"
        :selected-instance="dashboard.selectedInstance.value"
        @update:selected-instance="dashboard.selectedInstance.value = $event"
      />
      <BusinessData :business-summary="dashboard.businessSummary.value" />
    </div>

    <!-- Layer 4: API Overview -->
    <ApiOverview
      :distribution="dashboard.apiDistribution.value"
      :top-failures="dashboard.apiTopFailures.value"
      :trend="dashboard.apiTrend.value"
    />

    <!-- Layer 5: Trend Charts + Activity Feed -->
    <div class="grid grid-cols-1 md:grid-cols-24 gap-16px">
      <div class="md:col-span-15">
        <TrendCharts
          :user-trend="dashboard.userTrend.value"
          :trend-range="dashboard.trendRange.value"
          :loading="dashboard.loading.userTrend"
          @range-change="dashboard.onTrendRangeChange"
        />
      </div>
      <div class="md:col-span-9 min-h-400px md:min-h-0 relative">
        <div class="h-full md:absolute md:inset-0">
          <ActivityFeed :activities="dashboard.activities.value" :audit-dict="dashboard.auditDict.value" />
        </div>
      </div>
    </div>
  </div>
</template>
