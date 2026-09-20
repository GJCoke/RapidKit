import { ref, watch } from "vue"
import type { Ref } from "vue"

type ActiveMenuOptionsResult = {
  data: Api.SystemManage.ActiveMenuOption[] | null
  error: unknown
}

type FetchActiveMenuOptions = (parentId: string, constant: boolean) => Promise<ActiveMenuOptionsResult>

type ActiveMenuPartitionModel = {
  parentId?: string | null
  constant?: boolean | null
  activeMenu?: string | null
}

type LoadActiveMenuOptions = (parentId: string | null | undefined, constant: boolean) => void | Promise<void>

export function createActiveMenuOptionsLoader(fetchActiveMenuOptions: FetchActiveMenuOptions) {
  const activeMenuOptions = ref<CommonType.Option[]>([])
  let requestSequence = 0
  let currentRequestKey: string | null = null

  async function load(parentId: string | null | undefined, constant: boolean) {
    const requestKey = parentId ? `${parentId}:${constant}` : null
    currentRequestKey = requestKey
    const sequence = ++requestSequence
    activeMenuOptions.value = []

    if (!parentId || !requestKey) return

    try {
      const { data, error } = await fetchActiveMenuOptions(parentId, constant)

      if (sequence !== requestSequence || currentRequestKey !== requestKey) return
      if (error || !data) return

      activeMenuOptions.value = data.map((item) => ({
        label: `${item.menuName} (${item.routeName})`,
        value: item.routeName,
      }))
    } catch {
      // The options were cleared before requesting, so a transport error leaves a safe empty state.
    }
  }

  return { activeMenuOptions, load }
}

export function watchActiveMenuPartition(
  model: Ref<ActiveMenuPartitionModel>,
  visible: Ref<boolean>,
  isHydrating: () => boolean,
  loadActiveMenuOptions: LoadActiveMenuOptions,
) {
  return watch(
    () => model.value.constant,
    (constant) => {
      if (!visible.value || isHydrating()) return

      model.value.activeMenu = null
      void loadActiveMenuOptions(model.value.parentId, constant === true)
    },
    { flush: "sync" },
  )
}
