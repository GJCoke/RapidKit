import { computed, ref } from "vue"
import { fetchGetDashboardCapabilities } from "@/service/api"
import { resolvePermissionState, type HomePermissionState } from "../home-permission-state"

export function useHomePermissions(knownModules: readonly string[]) {
  const state = ref<HomePermissionState>("loading")
  const allowedModules = ref<string[]>([])
  const revision = ref("")

  const hasDashboardAccess = computed(() => state.value === "dashboard")

  async function loadCapabilities() {
    state.value = "loading"
    const { data, error } = await fetchGetDashboardCapabilities()
    if (error || !data) {
      allowedModules.value = []
      state.value = "unavailable"
      return
    }

    allowedModules.value = data.allowedModules
    revision.value = data.revision
    state.value = resolvePermissionState(knownModules, data.allowedModules)
  }

  return {
    state,
    allowedModules,
    revision,
    hasDashboardAccess,
    loadCapabilities,
    retry: loadCapabilities,
  }
}
