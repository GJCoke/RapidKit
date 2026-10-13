<script setup lang="ts">
  import { computed, ref } from "vue"
  import { $t } from "@/locales"
  import { deliveryTime, deliveryText as t } from "./delivery-presentation"

  defineOptions({ name: "DeliveryTechnicalInfo" })
  const props = defineProps<{ row: Api.Notification.Delivery }>()
  const expanded = ref(false)
  const fields = computed(() => [
    { label: t("deliveryId"), value: props.row.id },
    { label: t("messageId"), value: props.row.messageId },
    { label: t("userId"), value: props.row.userId },
    { label: t("lastErrorCode"), value: props.row.lastErrorCode },
    ...(props.row.lockedUntil ? [{ label: t("lockedUntil"), value: deliveryTime(props.row.lockedUntil) }] : []),
  ])
  function toggle(event: Event) {
    expanded.value = (event.target as HTMLDetailsElement).open
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      window.$message?.success(t("copySucceeded"))
    } catch {
      window.$message?.error(t("copyFailed"))
    }
  }
</script>

<template>
  <details class="mt-20px border-t border-theme-default pt-14px" @toggle="toggle">
    <summary class="cursor-pointer text-13px text-base-text-3">{{ t("technicalInfo") }}</summary>
    <div v-if="expanded" class="mt-14px flex-col-stretch gap-12px">
      <div v-for="field in fields" :key="field.label">
        <div class="mb-4px flex-y-center justify-between gap-8px">
          <span class="text-12px text-base-text-3">{{ field.label }}</span>
          <NButton
            v-if="field.value"
            size="tiny"
            quaternary
            :aria-label="$t('page.notification.manage.deliveries.copyField', { field: field.label })"
            @click="copy(field.value)"
            >{{ t("copy") }}</NButton
          >
        </div>
        <code class="break-all text-12px">{{ field.value || "—" }}</code>
      </div>
    </div>
  </details>
</template>
