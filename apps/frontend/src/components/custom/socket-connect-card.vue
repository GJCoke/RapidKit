<script setup lang="ts">
  import { ref, watch } from "vue"

  interface Props {
    isConnected: boolean
    isConnecting: boolean
    title?: string
    url: string
    path: string
    namespace: string
    showAdvancedDefault?: boolean
    tipText?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    title: "",
    showAdvancedDefault: false,
    tipText: "",
  })

  const emit = defineEmits<{
    "update:url": [value: string]
    "update:path": [value: string]
    "update:namespace": [value: string]
    connect: []
    disconnect: []
  }>()

  const showAdvanced = ref(props.showAdvancedDefault)

  watch(
    () => props.isConnected,
    (connected) => {
      if (connected && showAdvanced.value) {
        showAdvanced.value = false
      }
    },
  )

  const handleAction = () => {
    if (props.isConnected) {
      emit("disconnect")
    } else {
      emit("connect")
    }
  }
</script>

<template>
  <n-card :title="title" size="small" class="shadow-sm border-none">
    <div class="flex flex-col gap-4">
      <!-- 第一行：核心连接配置 -->
      <n-grid :cols="24" :x-gap="12">
        <n-gi :span="8">
          <n-input-group>
            <n-input-group-label>{{ $t("page.socketio.common.url") }}</n-input-group-label>
            <n-input
              :value="url"
              :placeholder="$t('page.socketio.common.urlPlaceholder')"
              @update:value="(v) => emit('update:url', v)"
            />
          </n-input-group>
        </n-gi>
        <n-gi :span="8">
          <n-input-group>
            <n-input-group-label>{{ $t("page.socketio.common.path") }}</n-input-group-label>
            <n-input
              :value="path"
              :placeholder="$t('page.socketio.common.pathPlaceholder')"
              @update:value="(v) => emit('update:path', v)"
            />
          </n-input-group>
        </n-gi>
        <n-gi :span="8" class="flex gap-2 items-center">
          <n-button
            class="flex-1"
            :type="isConnected ? 'error' : 'primary'"
            :loading="isConnecting"
            @click="handleAction"
          >
            {{ isConnected ? $t("page.socketio.common.disconnect") : $t("page.socketio.common.connect") }}
          </n-button>
          <n-button quaternary size="small" @click="showAdvanced = !showAdvanced">
            <template #icon>
              <div :class="['transition-transform duration-300', showAdvanced ? 'rotate-180' : '']">
                <icon-ic-baseline-keyboard-arrow-down />
              </div>
            </template>
          </n-button>
        </n-gi>
      </n-grid>

      <!-- 高级配置：确保在 n-card 内部展开 -->
      <n-collapse-transition :show="showAdvanced">
        <!-- 身份验证插槽 -->
        <div v-if="$slots.auth">
          <slot name="auth"></slot>
        </div>
        <div class="pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <n-grid :cols="24" :x-gap="12" :y-gap="8">
            <n-gi :span="10">
              <n-input-group>
                <n-input-group-label>{{ $t("page.socketio.common.namespace") }}</n-input-group-label>
                <n-input
                  :value="namespace"
                  :placeholder="$t('page.socketio.common.namespacePlaceholder')"
                  @update:value="(v) => emit('update:namespace', v)"
                />
              </n-input-group>
            </n-gi>
            <n-gi :span="14" class="flex items-center">
              <n-text depth="3" class="text-[11px] leading-tight italic">
                {{ tipText }}
              </n-text>
            </n-gi>
            <n-gi :span="24">
              <slot name="advanced"></slot>
            </n-gi>
          </n-grid>
        </div>
      </n-collapse-transition>
    </div>
  </n-card>
</template>
