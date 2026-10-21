<script setup lang="ts">
  import { computed } from "vue"
  import { userStatusRecord } from "@/constants/business"
  import { $t } from "@/locales"

  defineOptions({ name: "UserSearch" })
  const emit = defineEmits<{ search: [] }>()
  const model = defineModel<Api.SystemManage.UserSearchParams>("model", { required: true })
  const statusOptions = computed(() =>
    Object.entries(userStatusRecord).map(([value, label]) => ({ value, label: $t(label) })),
  )

  function reset() {
    model.value.keyword = ""
    model.value.status = null
    emit("search")
  }
</script>

<template>
  <form class="flex flex-wrap items-center gap-10px" @submit.prevent="emit('search')">
    <NInput
      v-model:value="model.keyword"
      clearable
      class="min-w-180px !w-auto flex-1"
      :placeholder="$t('page.manage.user.form.keyword')"
      :aria-label="$t('page.manage.user.keyword')"
    >
      <template #prefix><icon-ic-round-search class="text-base-text-3" /></template>
    </NInput>
    <NSelect
      v-model:value="model.status"
      clearable
      :options="statusOptions"
      class="w-140px"
      :placeholder="$t('page.manage.user.directory.allStatuses')"
      :aria-label="$t('page.manage.user.userStatus')"
    />
    <NButton attr-type="submit" type="primary">{{ $t("common.search") }}</NButton>
    <NButton @click="reset">{{ $t("common.reset") }}</NButton>
  </form>
</template>
