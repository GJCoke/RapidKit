<script setup lang="ts">
  import { ref } from "vue"
  import ChatWindow from "./modules/chat-window.vue"
  import ChatUserSelector from "./modules/chat-user-selector.vue"
  import type { ChatInstance } from "./modules/types"
  import { useMessage } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "SocketIoChat" })

  const message = useMessage()
  const instances = ref<ChatInstance[]>([])

  const handleJoin = (instance: ChatInstance) => {
    const isExists = instances.value.some((i) => i.username === instance.username && i.group === instance.group)

    if (isExists) {
      message.warning($t("page.socketio.chat.alreadyInRoom", { username: instance.username, group: instance.group }))
      return
    }
    instances.value.push(instance)
  }

  const removeInstance = (id: string) => {
    instances.value = instances.value.filter((i) => i.id !== id)
  }
</script>

<template>
  <div class="p-4 h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col">
    <ChatUserSelector :disabled="instances.length >= 4" @join="handleJoin" />

    <div class="flex-1 min-h-0 overflow-y-auto pt-2">
      <!-- 状态显示 -->
      <div v-if="instances.length > 0" class="mb-4 flex items-center justify-end">
        <n-text depth="3" class="text-xs italic">
          {{ $t("page.socketio.chat.activeInstances", { current: instances.length, max: 4 }) }}
        </n-text>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 h-full auto-rows-min">
        <ChatWindow
          v-for="inst in instances"
          :key="inst.id"
          :username="inst.username"
          :group="inst.group"
          :avatar="inst.avatar"
          @close="removeInstance(inst.id)"
        />

        <div
          v-if="instances.length === 0"
          class="col-span-full h-80 flex items-center justify-center opacity-30 grayscale"
        >
          <n-empty :description="$t('page.socketio.chat.noInstances')" />
        </div>
      </div>
    </div>
  </div>
</template>
