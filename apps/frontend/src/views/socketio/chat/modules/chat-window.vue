<script setup lang="ts">
  import { ref, onMounted, nextTick } from "vue"
  import type { ScrollbarInst } from "naive-ui"
  import type { Message } from "./types"
  import { $t } from "@/locales"
  import { useSocket } from "@/hooks/common/socket"

  interface Props {
    username: string
    group: string
    avatar?: string
  }

  const props = defineProps<Props>()
  const emit = defineEmits(["close"])

  const messages = ref<Message[]>([])
  const inputText = ref("")
  const scrollbarRef = ref<ScrollbarInst | null>(null)

  const { socket, isConnected, connect } = useSocket()

  const url = new URL(import.meta.env.VITE_SERVICE_BASE_URL, window.location.origin)

  const initSocket = () => {
    const instance = connect({
      url: url.origin,
      namespace: "/chat",
      auth: { username: props.username },
      ioOptions: {
        query: { group: props.group },
      },
      onConnect: () => socket.value?.emit("join", props.group),
    })

    if (instance) {
      instance.on("message", (msg: Message) => {
        messages.value.push({ ...msg, isSelf: msg.sender === props.username })
        scrollToBottom()
      })
    }
  }

  const sendMessage = () => {
    if (!inputText.value.trim() || !socket.value) return
    socket.value.emit("message", {
      content: inputText.value,
      group: props.group,
      avatar: props.avatar,
    })
    inputText.value = ""
  }

  const scrollToBottom = () => {
    nextTick(() => {
      scrollbarRef.value?.scrollTo({ top: 999999, behavior: "smooth" })
    })
  }

  onMounted(initSocket)
</script>

<template>
  <n-card
    size="small"
    closable
    class="h-[350px] flex flex-col shadow-sm border-primary/20"
    content-style="padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column;"
    @close="emit('close')"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <n-avatar round size="small" :src="avatar" />
        <div class="flex flex-col">
          <span class="font-bold text-xs leading-none mb-1">
            {{ $t(("page.socketio.chat.characters." + username) as I18nFullKey) }}
          </span>
          <div class="flex items-center gap-1">
            <div :class="['w-1.5 h-1.5 rounded-full', isConnected ? 'bg-success' : 'bg-zinc-300']"></div>
            <span class="text-[9px] text-zinc-400 uppercase font-bold">
              {{ isConnected ? $t("page.socketio.common.online") : $t("page.socketio.common.offline") }}
            </span>
          </div>
        </div>
        <n-tag size="small" round type="info" class="ml-2">
          {{ $t(("page.socketio.chat.rooms." + group) as I18nFullKey) }}
        </n-tag>
      </div>
    </template>

    <n-scrollbar ref="scrollbarRef" class="bg-zinc-50 dark:bg-zinc-900/50">
      <div class="p-3 flex flex-col gap-4">
        <template v-for="m in messages" :key="m.id">
          <!-- 系统消息 -->
          <div v-if="m.type === 'system'" class="flex justify-center my-1">
            <span class="px-3 py-1 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full text-[10px] text-zinc-500">
              {{
                $t(m.content.key as I18nFullKey, {
                  ...m.content.params,
                  username: $t(("page.socketio.chat.characters." + m.content.params?.username) as I18nFullKey),
                  group: $t(("page.socketio.chat.rooms." + m.content.params?.group) as I18nFullKey),
                })
              }}
            </span>
          </div>

          <!-- 普通用户消息 -->
          <div
            v-else
            :class="['flex gap-2 max-w-[90%]', m.isSelf ? 'flex-row-reverse self-end' : 'flex-row self-start']"
          >
            <!-- 消息头像 -->
            <n-avatar
              round
              :size="32"
              :src="m.avatar || (m.isSelf ? avatar : undefined)"
              class="flex-shrink-0 border border-zinc-200 dark:border-zinc-700"
            />

            <!-- 消息内容 -->
            <div :class="['flex flex-col', m.isSelf ? 'items-end' : 'items-start']">
              <span class="text-[10px] text-zinc-400 mb-1 px-1">
                {{ $t(("page.socketio.chat.characters." + m.sender) as I18nFullKey) }} · {{ m.time }}
              </span>
              <div
                :class="[
                  'px-3 py-2 rounded-lg text-sm shadow-sm',
                  m.isSelf
                    ? 'bg-primary text-white rounded-tr-none'
                    : 'bg-white dark:bg-zinc-800 border rounded-tl-none border-zinc-200 dark:border-zinc-700',
                ]"
              >
                {{ m.content }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </n-scrollbar>

    <template #action>
      <div class="flex gap-2">
        <n-input
          v-model:value="inputText"
          size="small"
          :placeholder="
            $t('page.socketio.chat.sendRoomMessage', {
              group: $t(('page.socketio.chat.rooms.' + group) as I18nFullKey),
            })
          "
          @keydown.enter="sendMessage"
        />
        <n-button type="primary" size="small" @click="sendMessage">
          <template #icon><icon-mdi-send /></template>
        </n-button>
      </div>
    </template>
  </n-card>
</template>
