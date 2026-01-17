<script setup lang="ts">
  import { reactive, ref } from "vue"
  import { useMessage } from "naive-ui"
  import { localStg } from "@/utils/storage"
  import { $t } from "@/locales"
  import { useSocket } from "@/hooks/common/socket"
  import SocketLogCard from "@/components/custom/socket-log-card.vue"

  interface LogItem {
    type: "info" | "error" | "send" | "receive"
    time: string
    event?: string
    content: string
  }

  defineOptions({ name: "SocketIoDebug" })

  const message = useMessage()
  const url = new URL(import.meta.env.VITE_SERVICE_BASE_URL || window.location.origin)

  const config = reactive({
    url: url.origin,
    path: "/socket.io",
    auth: {},
    namespace: "/",
  })

  const authString = ref(JSON.stringify({ accessToken: localStg.get("token") }, null, 2))

  const sendForm = reactive({
    event: "message",
    data: '{"msg": "hello"}',
  })

  const logs = ref<LogItem[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addLog = (type: LogItem["type"], content: any, event?: string) => {
    logs.value.unshift({
      type,
      time: new Date().toLocaleTimeString(),
      event,
      content: typeof content === "object" ? JSON.stringify(content, null, 2) : String(content),
    })
  }

  const clearLogs = () => {
    logs.value = []
  }

  const { socket, isConnected, isConnecting, connect, disconnect } = useSocket()

  // 在页面层处理具体的监听和日志记录
  const handleConnect = () => {
    try {
      config.auth = JSON.parse(authString.value)
    } catch (e) {
      message.error($t("page.socketio.debug.invalidJson"))
      return
    }

    const sio = connect({
      ...config,
      onConnect: () => addLog("info", `Connected (ID: ${socket.value?.id})`),
      onDisconnect: (reason) => addLog("info", `Disconnected: ${reason}`),
      onError: (err) => addLog("error", `Connection Error: ${err.message}`),
    })
    if (!sio) return

    sio.onAny((event, ...args) => {
      addLog("receive", args.length === 1 ? args[0] : args, event)
    })
  }

  const emitEvent = () => {
    if (!socket.value?.connected) {
      message.warning($t("page.socketio.debug.connectFirst"))
      return
    }

    try {
      const payload = JSON.parse(sendForm.data)
      socket.value.emit(sendForm.event, payload)
      addLog("send", payload, sendForm.event)
    } catch (e) {
      message.error($t("page.socketio.debug.invalidJson"))
    }
  }

  const mapLogTypeToTagType = (logType: string) => {
    switch (logType) {
      case "send":
        return "warning"
      case "receive":
        return "success"
      case "error":
        return "error"
      default:
        return "info"
    }
  }
</script>

<template>
  <div class="h-full bg-zinc-50 dark:bg-zinc-950">
    <n-scrollbar content-style="height: 100%; display: flex; flex-direction: column;">
      <div class="flex-1 flex flex-col gap-4 p-4 min-h-full">
        <socket-connect-card
          v-model:url="config.url"
          v-model:path="config.path"
          v-model:namespace="config.namespace"
          :is-connected="isConnected"
          :is-connecting="isConnecting"
          :title="$t('page.socketio.debug.connectionTitle')"
          @connect="handleConnect"
          @disconnect="disconnect"
        >
          <template #auth>
            <div class="mt-2">
              <div class="mb-1 text-xs text-zinc-400 font-mono">{{ $t("page.socketio.common.authTitle") }}</div>
              <n-input
                v-model:value="authString"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 5 }"
                :placeholder="$t('page.socketio.common.authPlaceholder')"
                font-size="12"
              />
            </div>
          </template>
        </socket-connect-card>

        <!-- 内容区域 -->
        <div class="flex-1 flex gap-4 min-h-[400px]">
          <!-- 发送面板 -->
          <n-card
            :title="$t('page.socketio.debug.emitTitle')"
            size="small"
            class="w-1/3 flex flex-col h-full"
            content-style="flex: 1; display: flex; flex-direction: column; min-height: 0;"
          >
            <div class="flex flex-col gap-4 h-full">
              <div>
                <div class="mb-2 text-gray-500">{{ $t("page.socketio.debug.eventName") }}</div>
                <n-input v-model:value="sendForm.event" :placeholder="$t('page.socketio.debug.eventPlaceholder')" />
              </div>
              <div class="flex-1 flex flex-col min-h-0">
                <div class="mb-2 text-gray-500">{{ $t("page.socketio.debug.dataJson") }}</div>
                <n-input
                  v-model:value="sendForm.data"
                  type="textarea"
                  class="flex-1"
                  :placeholder="$t('page.socketio.debug.dataPlaceholder')"
                />
              </div>
              <n-button type="primary" block :disabled="!isConnected" @click="emitEvent">
                {{ $t("page.socketio.debug.sendEvent") }}
              </n-button>
            </div>
          </n-card>

          <!-- 日志面板 -->
          <n-card
            :title="$t('page.socketio.debug.logsTitle')"
            size="small"
            class="flex-1 flex flex-col h-full overflow-hidden"
            content-style="padding: 0; flex: 1; display: flex; flex-direction: column; min-height: 0;"
          >
            <template #header-extra>
              <n-button size="tiny" quaternary @click="clearLogs">{{ $t("page.socketio.debug.clear") }}</n-button>
            </template>
            <n-empty v-if="logs.length === 0" :description="$t('page.socketio.debug.noMessages')" class="my-auto" />
            <n-scrollbar v-else class="flex-1">
              <div class="p-4 font-mono text-xs flex flex-col gap-3">
                <div v-for="(log, idx) in logs" :key="idx">
                  <socket-log-card
                    sid=""
                    namespace=""
                    :time="log.time"
                    :event="log.event"
                    :tag-type="mapLogTypeToTagType(log.type)"
                    :type="log.type"
                    :data="log.content"
                  />
                </div>
              </div>
            </n-scrollbar>
          </n-card>
        </div>
      </div>
    </n-scrollbar>
  </div>
</template>
