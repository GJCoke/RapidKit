<script setup lang="ts">
  import { computed, toRef } from "vue"
  import { useAvatarImage } from "@/hooks/common/use-avatar-image"
  import { $t } from "@/locales"
  import { getAvatarGradient, getAvatarText, normalizeAvatarName } from "@/utils/avatar"

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
  const avatarStyle = computed(() => {
    const gradient = getAvatarGradient(props.seed, props.name)

    return {
      "--avatar-gradient-start": gradient.start,
      "--avatar-gradient-end": gradient.end,
      "--avatar-font-size": `${Math.max(12, Math.min(20, Math.round(props.size * 0.36)))}px`,
    }
  })
</script>

<template>
  <NAvatar
    :src="displaySrc"
    :size="size"
    :round="round"
    :img-props="{ alt: avatarLabel }"
    :aria-label="avatarLabel"
    :style="avatarStyle"
    class="app-avatar shrink-0 select-none text-white font-600"
    @error="handleImageError"
  >
    <span v-if="avatarText">{{ avatarText }}</span>
    <SvgIcon v-else icon="ph:user" aria-hidden="true" />
  </NAvatar>
</template>

<style scoped>
  .app-avatar {
    background: linear-gradient(145deg, var(--avatar-gradient-start) 0%, var(--avatar-gradient-end) 100%);
    font-size: var(--avatar-font-size);
  }
</style>
