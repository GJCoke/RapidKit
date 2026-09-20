<script setup lang="ts">
  import { computed } from "vue"
  import dayjs from "dayjs"
  import { $t } from "@/locales"
  import { renderContent, renderTitle } from "@/utils/notification/content-render"
  import { isNotificationActionable } from "@/utils/notification/state"

  defineOptions({ name: "MessageItem" })

  interface Props {
    message: Api.Notification.Message
    showActions?: boolean
    compact?: boolean
  }

  const props = withDefaults(defineProps<Props>(), { showActions: true, compact: false })
  const emit = defineEmits<{
    click: [message: Api.Notification.Message]
    archive: [id: string]
    delete: [id: string]
  }>()

  const title = computed(() => renderTitle(props.message))
  const body = computed(() => renderContent(props.message))
  const stateText = computed(() => {
    if (props.message.status === "recalled") return $t("page.notification.recalled" as I18nFullKey)
    if (props.message.status === "expired")
      return $t("page.notification.manage.announcements.status.expired" as I18nFullKey)
    return body.value
  })
  const isUnread = computed(() => !props.message.readAt)
  const isActionable = computed(() => isNotificationActionable(props.message))
  const levelType = computed(() => {
    const types = { info: "info", success: "success", warning: "warning", error: "error" } as const
    return types[props.message.level]
  })
  const levelLabel = computed(() => $t(`page.notification.level.${props.message.level}` as I18nFullKey))
  const levelIcon = computed(() => {
    const icons = {
      info: "carbon:information",
      success: "carbon:checkmark-outline",
      warning: "carbon:warning-alt",
      error: "carbon:error",
    } as const
    return icons[props.message.level]
  })
  const levelClass = computed(() => {
    const classes = {
      info: "bg-info/10 text-info",
      success: "bg-success/10 text-success",
      warning: "bg-warning/10 text-warning",
      error: "bg-error/10 text-error",
    } as const
    return classes[props.message.level]
  })
  const createdAt = computed(() => dayjs(props.message.createTime).format("YYYY-MM-DD HH:mm:ss"))

  function selectMessage() {
    emit("click", props.message)
  }
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="title"
    class="group cursor-pointer outline-none transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-primary"
    :class="
      compact
        ? [
            'relative flex gap-12px border-b border-theme-default px-16px py-14px last:border-b-0 hover:bg-theme-modal',
            isUnread ? 'bg-primary/5' : 'bg-transparent',
          ]
        : 'flex flex-col gap-6px border-b border-theme-default px-16px py-13px hover:bg-theme-modal'
    "
    @click="selectMessage"
    @keydown.enter.prevent="selectMessage"
    @keydown.space.prevent="selectMessage"
  >
    <div v-if="compact" class="relative mt-1px size-32px flex-center shrink-0 rd-full" :class="levelClass">
      <SvgIcon :icon="levelIcon" class="text-15px" />
      <span
        v-if="isUnread"
        class="absolute right--1px top--1px size-7px rd-full bg-primary ring-2 ring-base"
        aria-hidden="true"
      ></span>
    </div>

    <div :class="compact ? 'min-w-0 flex-1' : 'contents'">
      <div class="flex items-start gap-6px">
        <NBadge v-if="isUnread && !compact" dot type="error" class="mt-7px" />
        <NTag v-if="!compact" :type="levelType" size="small" :bordered="false">{{ levelLabel }}</NTag>
        <span
          class="min-w-0 flex-1 truncate text-14px leading-20px text-base-text-1"
          :class="isUnread ? 'font-600' : 'font-500'"
        >
          {{ title }}
        </span>
        <NTag v-if="message.mandatory" type="warning" size="tiny" :bordered="false">
          {{ $t("page.notification.mandatory" as I18nFullKey) }}
        </NTag>
      </div>

      <p
        class="m-0 mt-3px whitespace-pre-line line-clamp-2 text-base-text-2"
        :class="compact ? 'text-12px leading-18px' : 'text-13px leading-19px'"
      >
        {{ stateText }}
      </p>

      <div class="mt-6px flex-y-center gap-5px text-base-text-3" :class="compact ? 'text-11px' : 'text-12px'">
        <template v-if="compact">
          <span>{{ levelLabel }}</span>
          <span aria-hidden="true">·</span>
          <time :datetime="message.createTime" class="tabular-nums">{{ createdAt }}</time>
          <SvgIcon v-if="isActionable" icon="carbon:chevron-right" class="ml-auto text-12px text-base-text-4" />
        </template>
        <time v-else :datetime="message.createTime" class="tabular-nums">{{ createdAt }}</time>
        <div v-if="showActions" class="ml-auto flex gap-4px" @click.stop @keydown.stop>
          <NButton ghost size="tiny" @click="emit('archive', message.id)">
            {{ $t("page.notification.archive" as I18nFullKey) }}
          </NButton>
          <NPopconfirm @positive-click="emit('delete', message.id)">
            <template #trigger>
              <NButton ghost size="tiny" type="error">
                {{ $t("page.notification.delete" as I18nFullKey) }}
              </NButton>
            </template>
            {{ $t("common.confirmDelete") }}
          </NPopconfirm>
        </div>
      </div>
    </div>
  </div>
</template>
