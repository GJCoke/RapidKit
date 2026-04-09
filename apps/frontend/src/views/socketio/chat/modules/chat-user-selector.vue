<script setup lang="ts">
  import { ref } from "vue"
  import { $t } from "@/locales"
  import type { ChatInstance } from "./types"

  import Doraemon from "@/assets/imgs/avatar_doraemon.jpg"
  import Gian from "@/assets/imgs/avatar_gian.jpg"
  import Nobita from "@/assets/imgs/avatar_nobita.jpg"
  import Shizuka from "@/assets/imgs/avatar_shizuka.jpg"
  import Suneo from "@/assets/imgs/avatar_suneo.jpg"

  interface Props {
    disabled: boolean
  }

  defineProps<Props>()
  const emit = defineEmits<{
    join: [instance: ChatInstance]
  }>()

  const selectedGroup = ref("Nobis-Home")

  const availableUsers = [
    { name: "Doraemon", img: Doraemon },
    { name: "Nobita", img: Nobita },
    { name: "Shizuka", img: Shizuka },
    { name: "Gian", img: Gian },
    { name: "Suneo", img: Suneo },
  ]

  const handleSelect = (user: { name: string; img: string }) => {
    emit("join", {
      id: `${user.name}-${Date.now()}`,
      username: user.name,
      group: selectedGroup.value,
      avatar: user.img,
    })
  }
</script>

<template>
  <n-card size="small" class="shadow-sm border-none mb-4">
    <div class="flex items-center justify-between gap-6">
      <div class="flex flex-col gap-2">
        <span class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          {{ $t("page.socketio.chat.selectCharacter") }}
        </span>
        <div class="flex gap-4">
          <div
            v-for="user in availableUsers"
            :key="user.name"
            class="group relative flex flex-col items-center gap-1 cursor-pointer"
            :class="{ 'opacity-50 pointer-events-none': disabled }"
          >
            <n-popconfirm @positive-click="handleSelect(user)">
              <template #trigger>
                <div
                  class="relative overflow-hidden rounded-full border-2 border-transparent group-hover:border-primary transition-all shadow-sm"
                >
                  <n-avatar round :size="54" :src="user.img" class="block" />
                  <div
                    class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  >
                    <icon-mdi-plus class="text-white text-2xl" />
                  </div>
                </div>
              </template>
              {{
                $t("page.socketio.chat.confirmJoin", {
                  username: $t(("page.socketio.chat.characters." + user.name) as I18nFullKey),
                  group: $t(("page.socketio.chat.rooms." + selectedGroup) as I18nFullKey),
                })
              }}
            </n-popconfirm>
            <span class="text-[11px] font-medium text-zinc-500 group-hover:text-primary transition-colors">
              {{ $t(("page.socketio.chat.characters." + user.name) as I18nFullKey) }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 min-w-[140px]">
        <span class="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          {{ $t("page.socketio.chat.targetRoom") }}
        </span>
        <n-select
          v-model:value="selectedGroup"
          size="medium"
          :options="
            ['Nobis-Home', 'Secret-Base', 'School', 'Doraemon-Fans'].map((v) => ({
              label: $t(('page.socketio.chat.rooms.' + v) as I18nFullKey),
              value: v,
            }))
          "
        />
      </div>
    </div>
  </n-card>
</template>
