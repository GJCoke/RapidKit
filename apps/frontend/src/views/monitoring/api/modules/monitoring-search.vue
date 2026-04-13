<script setup lang="ts">
  import { $t } from "@/locales"

  defineOptions({ name: "MonitoringSearch" })

  interface SearchModel {
    keyword: string | null
    method: string | null
  }

  const model = defineModel<SearchModel>("model", {
    default: () => ({ keyword: null, method: null }),
  })

  const emit = defineEmits<{
    search: []
    reset: []
  }>()

  const methodOptions = [
    { label: "GET", value: "GET" },
    { label: "POST", value: "POST" },
    { label: "PUT", value: "PUT" },
    { label: "DELETE", value: "DELETE" },
    { label: "PATCH", value: "PATCH" },
  ]

  function handleReset() {
    model.value = { keyword: null, method: null }
    emit("reset")
  }
</script>

<template>
  <div class="flex items-center gap-12px flex-wrap">
    <NInput
      v-model:value="model.keyword"
      :placeholder="$t('page.monitoring.api.searchPlaceholder')"
      clearable
      class="w-240px"
      @keyup.enter="emit('search')"
    />
    <NSelect
      v-model:value="model.method"
      :options="methodOptions"
      :placeholder="$t('page.monitoring.api.allMethods')"
      clearable
      class="w-140px"
    />
    <NButton type="primary" @click="emit('search')">
      <template #icon><SvgIcon icon="carbon:search" /></template>
      {{ $t("common.search") }}
    </NButton>
    <NButton @click="handleReset">
      <template #icon><SvgIcon icon="carbon:reset" /></template>
      {{ $t("common.reset") }}
    </NButton>
  </div>
</template>
