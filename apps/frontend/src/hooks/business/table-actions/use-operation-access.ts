import { computed, watch } from "vue"
import type { Ref } from "vue"
import { useAuth } from "@/hooks/business/auth"

/** Recheck permission at submission and close stale mutation surfaces. */
export function useOperationAccess(
  getPermission: () => PermissionCode,
  visible?: Ref<boolean>,
  eligible: () => boolean = () => true,
) {
  const { hasAuth } = useAuth()
  const allowed = computed(() => hasAuth(getPermission()) && eligible())
  if (visible) {
    watch(
      [allowed, visible],
      ([canOperate, open]) => {
        if (open && !canOperate) visible.value = false
      },
      { flush: "sync", immediate: true },
    )
  }
  return allowed
}
