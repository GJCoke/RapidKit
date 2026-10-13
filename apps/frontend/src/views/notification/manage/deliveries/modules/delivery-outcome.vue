<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"
  import {
    deliveryError,
    deliveryOutcomeTime,
    deliveryStateStyle,
    deliveryText as t,
    deliveryTime,
  } from "./delivery-presentation"

  defineOptions({ name: "DeliveryOutcome" })
  const props = defineProps<{ row: Api.Notification.Delivery }>()
  const style = computed(() => deliveryStateStyle[props.row.status])
  const keyTime = computed(() => deliveryOutcomeTime(props.row))
  const hasError = computed(() => ["dead", "retrying"].includes(props.row.status) && Boolean(props.row.lastErrorCode))
</script>

<template>
  <section class="delivery-outcome rd-12px border p-18px" :data-status="row.status" :aria-label="t('deliveryStatus')">
    <div class="flex items-start gap-12px">
      <div class="outcome-icon size-40px shrink-0 flex-center rd-10px" :class="style.color">
        <SvgIcon :icon="style.icon" class="text-24px" />
      </div>
      <div class="min-w-0">
        <h3 class="m-0 text-20px font-600 leading-28px" :class="style.color">{{ t(`outcome.title.${row.status}`) }}</h3>
        <p class="mb-0 mt-4px text-13px leading-21px text-base-text-2">{{ t(`outcome.description.${row.status}`) }}</p>
      </div>
    </div>
    <dl class="mb-0 mt-18px grid grid-cols-1 gap-14px min-[420px]:grid-cols-[1fr_2fr]">
      <div>
        <dt class="text-12px text-base-text-3">{{ t("attemptCount") }}</dt>
        <dd class="m-0 mt-4px text-15px font-600 tabular-nums text-base-text-1">
          {{ $t("page.notification.manage.deliveries.outcome.attempts", { count: row.attemptCount }) }}
        </dd>
      </div>
      <div>
        <dt class="text-12px text-base-text-3">{{ t(keyTime.label) }}</dt>
        <dd class="m-0 mt-4px text-14px font-500 tabular-nums text-base-text-1">{{ deliveryTime(keyTime.value) }}</dd>
      </div>
    </dl>
    <div v-if="hasError" class="outcome-error mt-16px border-t pt-12px text-13px leading-21px">
      <div class="mb-4px text-base-text-3">{{ t("errorReason") }}</div>
      <div class="break-words text-base-text-1">{{ deliveryError(row.lastErrorCode) }}</div>
    </div>
  </section>
</template>

<style scoped>
  .delivery-outcome {
    --outcome-color: var(--base-text-3-color);
    border-color: rgb(var(--outcome-color) / 0.2);
    background: rgb(var(--outcome-color) / 0.05);
  }
  .delivery-outcome[data-status="sent"] {
    --outcome-color: var(--success-color);
  }
  .delivery-outcome[data-status="retrying"] {
    --outcome-color: var(--warning-color);
  }
  .delivery-outcome[data-status="dead"] {
    --outcome-color: var(--error-color);
  }
  .delivery-outcome[data-status="processing"] {
    --outcome-color: var(--info-color);
  }
  .outcome-icon {
    background: rgb(var(--outcome-color) / 0.1);
  }
  .outcome-error {
    border-color: rgb(var(--outcome-color) / 0.16);
  }
</style>
