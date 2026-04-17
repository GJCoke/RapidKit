import { computed, reactive, ref } from "vue"
import { fetchPluginDependencies, fetchPluginEvents, fetchPluginList } from "@/service/api"

export function usePluginDashboard() {
  const plugins = ref<Api.Plugin.StatusItem[]>([])
  const depGraph = ref<Api.Plugin.DependencyGraph>({ nodes: [], edges: [] })
  const events = ref<Api.Plugin.EventStats>({
    handlerErrors: {},
    deadLetters: [],
    deadLetterCount: 0,
  })

  const loading = reactive({
    plugins: false,
    depGraph: false,
    events: false,
  })

  const stats = computed(() => {
    const items = plugins.value
    return {
      total: items.length,
      loaded: items.filter((p) => p.status === "loaded").length,
      disabled: items.filter((p) => p.status === "disabled").length,
      failed: items.filter((p) => p.status === "failed").length,
    }
  })

  async function loadPlugins() {
    loading.plugins = true
    const { data, error } = await fetchPluginList()
    if (!error) plugins.value = data
    loading.plugins = false
  }

  async function loadDepGraph() {
    loading.depGraph = true
    const { data, error } = await fetchPluginDependencies()
    if (!error) depGraph.value = data
    loading.depGraph = false
  }

  async function loadEvents() {
    loading.events = true
    const { data, error } = await fetchPluginEvents()
    if (!error) events.value = data
    loading.events = false
  }

  async function loadInitialData() {
    await Promise.allSettled([loadPlugins(), loadDepGraph(), loadEvents()])
  }

  return {
    plugins,
    depGraph,
    events,
    loading,
    stats,
    loadInitialData,
  }
}
