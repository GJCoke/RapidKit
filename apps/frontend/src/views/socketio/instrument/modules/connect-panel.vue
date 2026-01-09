<script setup lang="ts">
  import { reactive, ref } from "vue"
  import type { ConnectConfig } from "./types"

  interface Props {
    isConnected: boolean
    isConnecting: boolean
  }

  const props = defineProps<Props>()
  defineOptions({ name: "ConnectPanel" })
  const emit = defineEmits<{
    (e: "connect", config: ConnectConfig): void
    (e: "disconnect"): void
  }>()

  const showAdvanced = ref(false)
  const url = new URL(import.meta.env.VITE_SERVICE_BASE_URL)

  const config = reactive({
    url: url.origin || window.location.origin,
    path: "/socket.io",
    namespace: "/admin",
    username: "admin",
    password: "123456",
  })

  const handleAction = () => {
    if (props.isConnected) {
      emit("disconnect")
    } else {
      emit("connect", config)
    }
  }
</script>

<template>
  <n-card size="small" class="shadow-sm border-none">
    <div class="flex flex-col gap-4">
      <!-- 基础连接行 -->
      <div class="flex items-center gap-4">
        <n-input-group class="flex-1">
          <n-input-group-label>{{ $t("page.socketio.common.url") }}</n-input-group-label>
          <n-input v-model:value="config.url" placeholder="http://localhost:16000" />
        </n-input-group>

        <div class="flex gap-2 items-center">
          <n-button quaternary size="small" @click="showAdvanced = !showAdvanced">
            <template #icon>
              <div :class="['transition-transform duration-300', showAdvanced ? 'rotate-180' : '']">
                <icon-ic-baseline-keyboard-arrow-down />
              </div>
            </template>
            {{ showAdvanced ? $t("page.socketio.instrument.hideAdvanced") : $t("page.socketio.instrument.advanced") }}
          </n-button>

          <n-button
            :type="isConnected ? 'error' : 'primary'"
            :loading="isConnecting"
            class="min-w-[100px]"
            @click="handleAction"
          >
            {{ isConnected ? $t("page.socketio.common.disconnect") : $t("page.socketio.common.connect") }}
          </n-button>
        </div>
      </div>

      <!-- 第二行：身份验证 -->
      <div class="flex items-center gap-4">
        <n-input-group class="flex-1">
          <n-input-group-label>{{ $t("page.socketio.instrument.username") }}</n-input-group-label>
          <n-input v-model:value="config.username" placeholder="Admin username" />
        </n-input-group>

        <n-input-group class="flex-1">
          <n-input-group-label>{{ $t("page.socketio.instrument.password") }}</n-input-group-label>
          <n-input v-model:value="config.password" type="password" placeholder="Admin password" />
        </n-input-group>
      </div>

      <!-- 高级配置折叠区域 -->
      <n-collapse-transition :show="showAdvanced">
        <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex gap-4">
          <n-input-group class="flex-1">
            <n-input-group-label>{{ $t("page.socketio.common.namespace") }}</n-input-group-label>
            <n-input v-model:value="config.namespace" placeholder="/admin" />
          </n-input-group>
          <n-input-group class="flex-1">
            <n-input-group-label>{{ $t("page.socketio.common.path") }}</n-input-group-label>
            <n-input v-model:value="config.path" placeholder="/socket.io" />
          </n-input-group>
          <div class="flex-1 text-xs text-zinc-400 self-center">{{ $t("page.socketio.instrument.tip") }}</div>
        </div>
      </n-collapse-transition>
    </div>
  </n-card>
</template>
