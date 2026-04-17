<script setup lang="ts">
  import { onMounted } from "vue"
  import { usePluginDashboard } from "./composables/use-plugin-dashboard"
  import PluginStats from "./modules/plugin-stats.vue"
  import PluginTable from "./modules/plugin-table.vue"
  import PluginDepGraph from "./modules/plugin-dep-graph.vue"
  import PluginEvents from "./modules/plugin-events.vue"

  defineOptions({ name: "MonitoringPlugin" })

  const dashboard = usePluginDashboard()

  onMounted(() => {
    dashboard.loadInitialData()
  })
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <!-- Row 1: Summary stat cards -->
    <PluginStats :stats="dashboard.stats.value" :loading="dashboard.loading.plugins" />

    <!-- Row 2: Plugin table + Dependency graph (15:9) -->
    <div class="grid grid-cols-1 md:grid-cols-24 gap-16px">
      <div class="md:col-span-15">
        <PluginTable :plugins="dashboard.plugins.value" :loading="dashboard.loading.plugins" />
      </div>
      <div class="md:col-span-9 relative min-h-400px">
        <div class="md:absolute md:inset-0">
          <PluginDepGraph :graph="dashboard.depGraph.value" :loading="dashboard.loading.depGraph" />
        </div>
      </div>
    </div>

    <!-- Row 3: EventBus statistics -->
    <PluginEvents :events="dashboard.events.value" :loading="dashboard.loading.events" />
  </div>
</template>
