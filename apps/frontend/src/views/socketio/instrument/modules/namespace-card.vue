<script setup lang="ts">
  import { ref, computed } from "vue"
  import type { NamespaceInfo, ClientDetail } from "./types"
  import ClientCard from "./client-card.vue"

  interface Props {
    namespaces: NamespaceInfo[]
    allClients: ClientDetail[]
  }

  const props = defineProps<Props>()
  const showDrawer = ref(false)
  const selectedNsp = ref<string | null>(null)

  // 过滤出选中命名空间下的客户端
  const nspClients = computed(() => {
    if (!selectedNsp.value) return []
    return props.allClients.filter((c) => c.nsp === selectedNsp.value)
  })

  const handleViewClients = (nspName: string) => {
    selectedNsp.value = nspName
    showDrawer.value = true
  }
</script>

<template>
  <n-card
    :title="$t('page.socketio.instrument.namespaces')"
    size="small"
    class="shadow-sm border-none h-full"
    content-style="padding: 12px;"
  >
    <n-scrollbar class="max-h-[140px]">
      <div v-if="namespaces.length > 0" class="flex flex-col gap-2">
        <div
          v-for="ns in namespaces"
          :key="ns.name"
          class="flex items-center justify-between p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group"
          @click="handleViewClients(ns.name)"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_8px_rgba(24,160,88,0.4)]"
              :class="ns.socketsCount > 0 ? 'bg-success animate-pulse' : 'bg-zinc-300 dark:bg-zinc-700'"
            ></div>
            <div class="flex flex-col min-w-0">
              <span class="font-bold text-[13px] text-zinc-700 dark:text-zinc-200 truncate">{{ ns.name }}</span>
              <span class="text-[10px] text-zinc-400 tracking-tighter">{{
                $t("page.socketio.instrument.namespaceInstance")
              }}</span>
            </div>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <div class="flex flex-col items-end">
              <span class="text-xs font-bold font-mono text-primary">{{ ns.socketsCount }}</span>
              <span class="text-[9px] text-zinc-400 leading-none">{{ $t("page.socketio.instrument.clients") }}</span>
            </div>
            <n-button size="tiny" quaternary circle class="text-zinc-300 group-hover:text-primary transition-colors">
              <template #icon><icon-mdi-chevron-right /></template>
            </n-button>
          </div>
        </div>
      </div>
      <n-empty
        v-if="namespaces.length === 0"
        size="small"
        :description="$t('page.socketio.instrument.noNamespaces')"
        class="py-4"
      />
    </n-scrollbar>

    <!-- Namespace 客户端详情抽屉 -->
    <n-drawer v-model:show="showDrawer" :width="400">
      <n-drawer-content :title="$t('page.socketio.instrument.clientsInNamespace', { selectedNsp })" closable>
        <div class="space-y-3">
          <ClientCard v-for="c in nspClients" :key="c.id" :client="c" />
          <n-empty v-if="nspClients.length === 0" :description="$t('page.socketio.instrument.noInNamespace')" />
        </div>
      </n-drawer-content>
    </n-drawer>
  </n-card>
</template>
