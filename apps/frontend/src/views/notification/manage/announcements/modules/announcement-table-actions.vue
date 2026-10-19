<script setup lang="ts">
  import { computed, h } from "vue"
  import { useAuth } from "@/hooks/business/auth"
  import SvgIcon from "@/components/custom/svg-icon.vue"
  import { announcementActions, announcementActionLabel, announcementTableText as t } from "./announcement-table"
  import type { AnnouncementAction } from "./announcement-table"

  defineOptions({ name: "AnnouncementTableActions" })
  const props = defineProps<{ row: Api.Notification.AnnouncementItem; busy: boolean }>()
  const emit = defineEmits<{ action: [action: AnnouncementAction] }>()
  const { hasAuth } = useAuth()
  const actionStyles: Record<AnnouncementAction, { icon: string; color: string }> = {
    detail: { icon: "carbon:view", color: "text-info" },
    edit: { icon: "carbon:edit", color: "text-primary" },
    copy: { icon: "carbon:copy", color: "text-info" },
    publish: { icon: "carbon:send", color: "text-success" },
    cancel: { icon: "carbon:close-outline", color: "text-warning" },
    delete: { icon: "carbon:trash-can", color: "text-error" },
    recall: { icon: "carbon:undo", color: "text-warning" },
  }
  const actions = computed(() => announcementActions(props.row, hasAuth))
  const options = computed(() =>
    actions.value.more.map((key) => ({
      key,
      label: () => h("span", { class: actionStyles[key].color }, announcementActionLabel(props.row, key)),
      icon: () =>
        h("span", { class: `${actionStyles[key].color} flex-center text-16px`, "aria-hidden": "true" }, [
          h(SvgIcon, { icon: actionStyles[key].icon }),
        ]),
    })),
  )
  function select(action: AnnouncementAction) {
    if (props.busy || ![actions.value.primary, ...actions.value.more].includes(action)) return
    emit("action", action)
  }
</script>

<template>
  <div class="w-full flex items-center justify-start gap-8px whitespace-nowrap">
    <NButton ghost type="primary" size="small" :disabled="busy" @click="select(actions.primary)">
      <span class="max-w-full truncate">{{ announcementActionLabel(row, actions.primary) }}</span>
    </NButton>
    <NDropdown v-if="options.length" trigger="click" :options="options" :disabled="busy" @select="select">
      <NButton size="small" ghost :disabled="busy" :loading="busy" :aria-label="t('more')">
        {{ t("more") }}
      </NButton>
    </NDropdown>
  </div>
</template>
