<script setup lang="ts">
  import { createTextVNode, defineComponent } from "vue"
  import { useDialog, useLoadingBar, useMessage, useNotification } from "naive-ui"
  import { useMediaQuery } from "@vueuse/core"

  defineOptions({
    name: "AppProvider",
  })

  const coarsePointer = useMediaQuery("(pointer: coarse)")

  const ContextHolder = defineComponent({
    name: "ContextHolder",
    setup() {
      function register() {
        window.$loadingBar = useLoadingBar()
        window.$dialog = useDialog()
        window.$message = useMessage()
        window.$notification = useNotification()
      }

      register()

      return () => createTextVNode()
    },
  })
</script>

<template>
  <NLoadingBarProvider>
    <NDialogProvider>
      <NNotificationProvider
        :theme-overrides="{
          width: '416px',
          ...(coarsePointer ? { closeSize: '44px', closeMargin: '4px 4px 0 0' } : {}),
        }"
      >
        <NMessageProvider>
          <ContextHolder />
          <slot></slot>
        </NMessageProvider>
      </NNotificationProvider>
    </NDialogProvider>
  </NLoadingBarProvider>
</template>

<style scoped></style>
