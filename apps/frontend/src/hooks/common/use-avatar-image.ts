import { computed, ref, toValue, watch } from "vue"
import type { MaybeRefOrGetter } from "vue"

export function useAvatarImage(source: MaybeRefOrGetter<string | null | undefined>) {
  const imageFailed = ref(false)
  const displaySrc = computed(() => {
    const src = toValue(source)

    return src && !imageFailed.value ? src : undefined
  })

  watch(
    () => toValue(source),
    () => {
      imageFailed.value = false
    },
  )

  function handleImageError() {
    imageFailed.value = true
  }

  return {
    displaySrc,
    imageFailed,
    handleImageError,
  }
}
