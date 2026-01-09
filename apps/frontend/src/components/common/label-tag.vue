<script lang="ts" setup>
  import { computed, type ExtractPropTypes } from "vue"
  import type { tagProps } from "naive-ui"

  type TagType = ExtractPropTypes<typeof tagProps>["type"]

  const props = defineProps<{
    type?: TagType
    text: string
  }>()

  // 颜色映射
  const typeClassMap: Record<TagType, string> = {
    default: "bg-info text-white",
    info: "bg-zinc-500 text-white",
    error: "bg-error text-white",
    warning: "bg-warning text-white",
    success: "bg-success text-white",
    primary: "bg-primary text-white",
  }

  const tagClass = computed(() => {
    const base = "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
    return `${base} ${typeClassMap[props.type || "info"]}`
  })
</script>

<template>
  <span :class="tagClass">
    {{ text }}
  </span>
</template>
