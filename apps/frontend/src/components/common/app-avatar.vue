<script setup lang="ts">
  import { computed, toRef } from "vue"
  import { useAvatarImage } from "@/hooks/common/use-avatar-image"
  import { $t } from "@/locales"
  import { getAvatarColor, getAvatarText, normalizeAvatarName } from "@/utils/avatar"

  defineOptions({
    name: "AppAvatar",
  })

  interface Props {
    src?: string | null
    name?: string | null
    seed?: string | number | null
    size?: number
    round?: boolean
    alt?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    src: null,
    name: null,
    seed: null,
    size: 40,
    round: true,
  })

  const { displaySrc, handleImageError } = useAvatarImage(toRef(props, "src"))
  const avatarText = computed(() => getAvatarText(props.name))
  const avatarLabel = computed(() => props.alt || normalizeAvatarName(props.name) || $t("common.avatar"))
  const avatarStyle = computed(() => ({
    "--avatar-color": getAvatarColor(props.seed, props.name),
    "--avatar-font-size": `${Math.max(12, Math.min(20, Math.round(props.size * 0.36)))}px`,
  }))
</script>

<template>
  <NAvatar
    :src="displaySrc"
    :size="size"
    :round="round"
    :img-props="{ alt: avatarLabel }"
    :aria-label="avatarLabel"
    :style="avatarStyle"
    class="app-avatar shrink-0 select-none text-white font-700"
    @error="handleImageError"
  >
    <span v-if="avatarText">{{ avatarText }}</span>
    <SvgIcon v-else icon="ph:user" aria-hidden="true" />
  </NAvatar>
</template>

<style scoped>
  .app-avatar {
    background:
      linear-gradient(145deg, rgb(255 255 255 / 42%) 0%, rgb(255 255 255 / 10%) 43%, rgb(255 255 255 / 0%) 72%),
      var(--avatar-color);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 26%);
    font-size: var(--avatar-font-size);
  }
</style>
