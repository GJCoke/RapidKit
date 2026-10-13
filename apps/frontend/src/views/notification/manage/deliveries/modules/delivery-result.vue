<script setup lang="ts">
  import { deliveryError, deliveryTime, deliveryText as t } from "./delivery-presentation"
  defineOptions({ name: "DeliveryResult" })
  defineProps<{ row: Api.Notification.Delivery }>()
</script>

<template>
  <div class="break-words text-13px">
    <span v-if="row.lastErrorCode">{{ deliveryError(row.lastErrorCode) }}</span>
    <span v-else>{{ t(`result.${row.status}`) }}</span>
    <div v-if="row.status === 'retrying' && row.nextAttemptAt" class="mt-4px text-12px text-base-text-3">
      {{ t("nextAttemptAt") }} {{ deliveryTime(row.nextAttemptAt) }}
    </div>
    <div v-else-if="row.status === 'sent' && row.sentAt" class="mt-4px text-12px text-base-text-3">
      {{ deliveryTime(row.sentAt) }}
    </div>
  </div>
</template>
