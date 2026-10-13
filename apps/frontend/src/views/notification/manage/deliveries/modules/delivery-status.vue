<script setup lang="ts">
  import { deliveryStateStyle, deliveryText as t } from "./delivery-presentation"
  defineOptions({ name: "DeliveryStatus" })
  defineProps<{ status: Api.Notification.DeliveryStatus }>()
</script>

<template>
  <NTag :type="deliveryStateStyle[status].type" :bordered="false" size="small">
    <template #icon><SvgIcon :icon="deliveryStateStyle[status].icon" aria-hidden="true" /></template>
    {{ t(`status.${status}`) }}
  </NTag>
</template>
