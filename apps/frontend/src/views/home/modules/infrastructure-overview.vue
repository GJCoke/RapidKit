<script setup lang="ts">
  import InfraStatus from "./infra-status.vue"
  import ServerResources from "./server-resources.vue"

  defineOptions({ name: "InfrastructureOverview" })

  defineProps<{
    infrastructure: Api.Dashboard.InfrastructureHealth
    resources: Api.Dashboard.ResourceStats
    instanceResources: Map<string, Api.Dashboard.InstanceResourceStats>
    selectedInstance: string
  }>()

  const emit = defineEmits<{
    "update:selectedInstance": [value: string]
  }>()
</script>

<template>
  <div class="grid grid-cols-1 gap-16px md:grid-cols-2">
    <InfraStatus :infrastructure="infrastructure" />
    <ServerResources
      :resources="resources"
      :instance-resources="instanceResources"
      :selected-instance="selectedInstance"
      @update:selected-instance="emit('update:selectedInstance', $event)"
    />
  </div>
</template>
