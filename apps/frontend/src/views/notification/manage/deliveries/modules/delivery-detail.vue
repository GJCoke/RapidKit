<script setup lang="ts">
  import { computed } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import DeliveryOutcome from "./delivery-outcome.vue"
  import DeliveryRecipient from "./delivery-recipient.vue"
  import DeliveryMessage from "./delivery-message.vue"
  import DeliveryTechnicalInfo from "./delivery-technical-info.vue"
  import { deliveryOutcomeTime, deliveryTime, deliveryText as t } from "./delivery-presentation"

  defineOptions({ name: "DeliveryDetail" })
  const props = defineProps<{ row: Api.Notification.Delivery | null; canViewMessage?: boolean }>()
  const emit = defineEmits<{ viewMessage: [id: string]; returnWorkbench: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const theme = useThemeVars()
  const showUpdated = computed(() => props.row && !deliveryOutcomeTime(props.row).isUpdated)
  function returnToWorkbench() {
    visible.value = false
    emit("returnWorkbench")
  }
</script>

<template>
  <NDrawer v-model:show="visible" :width="550" placement="right" class="max-w-full">
    <NDrawerContent
      :title="t('detailTitle')"
      closable
      :native-scrollbar="false"
      :style="{ '--border-color': theme.dividerColor, '--fill-color': theme.actionColor }"
    >
      <div v-if="row" class="flex-col-stretch gap-22px">
        <DeliveryOutcome :row="row" />
        <section :aria-label="t('recipient')">
          <h3 class="mb-12px mt-0 text-13px font-500 text-base-text-3">{{ t("recipient") }}</h3>
          <DeliveryRecipient :recipient="row.recipient" :user-id="row.userId" />
        </section>
        <section :aria-label="t('outcome.relatedMessage')" class="rd-10px bg-theme-fill p-14px">
          <h3 class="mb-10px mt-0 text-12px font-500 text-base-text-3">
            {{ t("outcome.relatedMessage") }} · {{ t("inApp") }}
          </h3>
          <DeliveryMessage
            :message="row.message ?? null"
            :can-view="canViewMessage"
            @detail="emit('viewMessage', row.messageId)"
          />
        </section>
        <dl class="m-0 grid grid-cols-1 gap-12px min-[420px]:grid-cols-2">
          <div>
            <dt class="text-12px text-base-text-3">{{ t("createdAt") }}</dt>
            <dd class="m-0 mt-4px text-13px tabular-nums text-base-text-2">{{ deliveryTime(row.createTime) }}</dd>
          </div>
          <div v-if="showUpdated">
            <dt class="text-12px text-base-text-3">{{ t("updatedAt") }}</dt>
            <dd class="m-0 mt-4px text-13px tabular-nums text-base-text-2">{{ deliveryTime(row.updateTime) }}</dd>
          </div>
        </dl>
        <div class="flex items-start gap-8px text-12px leading-20px text-base-text-3">
          <SvgIcon icon="carbon:information" class="mt-2px shrink-0 text-16px" />
          <span>{{ row.status === "sent" ? t("sentHint") : t(`outcome.hint.${row.status}`) }}</span>
        </div>
        <DeliveryTechnicalInfo v-if="visible" :key="row.id" :row="row" class="!mt-0" />
      </div>
      <template #footer>
        <div class="flex-y-center justify-end gap-10px">
          <NButton @click="visible = false">{{ $t("common.close") }}</NButton>
          <NButton v-if="row?.status === 'dead'" type="primary" @click="returnToWorkbench">{{
            t("outcome.returnWorkbench")
          }}</NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
