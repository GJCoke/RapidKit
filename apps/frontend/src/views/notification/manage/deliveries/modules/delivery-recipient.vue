<script setup lang="ts">
  import { computed } from "vue"
  import { deliveryRecipientName, deliveryText as t } from "./delivery-presentation"

  defineOptions({ name: "DeliveryRecipient" })
  const props = defineProps<{ recipient?: Api.Notification.DeliveryRecipient | null; userId?: string }>()
  const name = computed(() => deliveryRecipientName(props.recipient))
  const subtitle = computed(() =>
    [
      props.recipient?.name.trim() && props.recipient.username ? `@${props.recipient.username}` : "",
      props.recipient?.department,
    ]
      .filter(Boolean)
      .join(" · "),
  )
</script>

<template>
  <div class="flex items-center gap-10px">
    <AppAvatar
      :size="36"
      :src="recipient?.state === 'deleted' ? undefined : recipient?.avatar"
      :name="recipient && recipient.state !== 'deleted' ? name : undefined"
      :seed="userId || recipient?.username"
      :alt="name"
    />
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-6px">
        <span class="break-words text-14px font-500 text-base-text-1">{{ name }}</span>
        <NTag
          v-if="recipient && ['disabled', 'pending'].includes(recipient.state)"
          size="small"
          :bordered="false"
          :type="recipient.state === 'disabled' ? 'default' : 'warning'"
        >
          {{ t(recipient.state === "disabled" ? "userDisabled" : "userPending") }}
        </NTag>
      </div>
      <div v-if="subtitle && recipient?.state !== 'deleted'" class="mt-3px break-all text-12px text-base-text-3">
        {{ subtitle }}
      </div>
    </div>
  </div>
</template>
