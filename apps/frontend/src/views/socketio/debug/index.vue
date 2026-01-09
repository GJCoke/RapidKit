<script setup lang="ts">
  import { reactive } from "vue"
  import { useMessage } from "naive-ui"
  import { localStg } from "@/utils/storage"
  import { $t } from "@/locales"
  import { useSocket } from "@/hooks/business/socket"
  import { useSocketLog } from "./modules/hooks"
  import SocketLogCard from "@/components/custom/socket-log-card.vue"

  defineOptions({ name: "SocketIoDebug" })

  const message = useMessage()
  const url = new URL(import.meta.env.VITE_SERVICE_BASE_URL || window.location.origin)

  const config = reactive({
    url: url.origin,
    path: "/socket.io",
    auth: { accessToken: localStg.get("token") },
  })

  const sendForm = reactive({
    event: "message",
    data: '{"msg": "hello"}',
  })

  const { socket, isConnected, isConnecting, connect, disconnect } = useSocket()
  const { logs, addLog, clearLogs } = useSocketLog()

  // 在页面层处理具体的监听和日志记录
  const handleConnect = () => {
    const sio = connect(config)
    if (!sio) return

    sio.on("connect", () => {
      addLog("info", `Connected (ID: ${sio.id})`)
    })

    sio.on("disconnect", (reason) => {
      addLog("info", `Disconnected: ${reason}`)
    })

    sio.on("connect_error", (err) => {
      addLog("error", `Connection Error: ${err.message}`)
    })

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
  <div class="h-full flex flex-col gap-4 p-4 overflow-hidden">
    <!-- 连接区域 -->
    <n-card :title="$t('page.socketio.debug.connectionTitle')" size="small" segmented>
      <n-grid :cols="24" :x-gap="12">
        <n-gi :span="10">
          <n-input-group>
            <n-input-group-label>{{ $t("page.socketio.common.url") }}</n-input-group-label>
            <n-input v-model:value="config.url" :placeholder="$t('page.socketio.common.urlPlaceholder')" />
          </n-input-group>
        </n-gi>
        <n-gi :span="6">
          <n-input-group>
            <n-input-group-label>{{ $t("page.socketio.common.path") }}</n-input-group-label>
            <n-input v-model:value="config.path" />
          </n-input-group>
        </n-gi>
        <n-gi :span="8" class="flex gap-2">
          <n-button
            v-if="!isConnected"
            type="primary"
            block
            :loading="isConnecting"
            :disabled="isConnecting"
            @click="handleConnect"
          >
            {{ $t("page.socketio.common.connect") }}
          </n-button>
          <n-button v-else type="error" block @click="disconnect">{{ $t("page.socketio.common.disconnect") }}</n-button>
        </n-gi>
        <n-gi :span="24" class="mt-2">
          <n-input-group>
            <n-input-group-label>{{ $t("page.socketio.debug.authToken") }}</n-input-group-label>
            <n-input
              v-model:value="config.auth.accessToken"
              type="password"
              show-password-on="mousedown"
              :placeholder="$t('page.socketio.debug.tokenPlaceholder')"
            />
          </n-input-group>
        </n-gi>
      </n-grid>
    </n-card>

    <!-- 内容区域 -->
    <div class="flex-1 flex gap-4 min-h-0">
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
</template>
