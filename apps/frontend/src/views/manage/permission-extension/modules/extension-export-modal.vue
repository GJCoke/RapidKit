<script setup lang="ts">
  import { ref, watch } from "vue"
  import { useClipboard } from "@vueuse/core"
  import { $t } from "@/locales"
  import { fetchExportPermissionExtensions } from "@/service/api"

  defineOptions({ name: "ExtensionExportModal" })

  const visible = defineModel<boolean>("visible", { default: false })
  const text = ref("")
  const loading = ref(false)
  const { copy } = useClipboard({ legacy: true })

  async function load() {
    loading.value = true
    const { data } = await fetchExportPermissionExtensions()
    loading.value = false
    text.value = data?.text ?? ""
  }

  async function handleCopy() {
    await copy(text.value)
    window.$message?.success($t("page.manage.permissionExtension.copied"))
  }

  watch(visible, (value) => {
    if (value) load()
  })
</script>

<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :title="$t('page.manage.permissionExtension.export')"
    class="w-720px max-w-[calc(100vw-32px)]"
  >
    <NText depth="3" class="mb-12px block">{{ $t("page.manage.permissionExtension.exportTip") }}</NText>
    <NSpin :show="loading">
      <NCode :code="text" language="python" word-wrap class="max-h-420px overflow-auto" />
    </NSpin>
    <template #footer>
      <div class="flex justify-end">
        <NButton type="primary" :disabled="!text" @click="handleCopy">
          {{ $t("page.manage.permissionExtension.copy") }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
