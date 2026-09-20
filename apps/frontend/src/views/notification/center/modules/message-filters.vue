<script setup lang="ts">
  import { reactive } from "vue"
  import type { InboxFilters } from "../composables/use-inbox"
  import { $t } from "@/locales"

  defineOptions({ name: "MessageFilters" })

  const emit = defineEmits<{ change: [filters: InboxFilters] }>()
  const model = reactive<InboxFilters>({
    unreadOnly: false,
    archived: "active",
    category: undefined,
    level: undefined,
    createdFrom: undefined,
    createdTo: undefined,
  })

  const levelOptions: Array<{ label: string; value: Api.Notification.Level }> = [
    "info",
    "success",
    "warning",
    "error",
  ].map((level) => ({
    label: $t(`page.notification.level.${level}` as I18nFullKey),
    value: level as Api.Notification.Level,
  }))

  function apply() {
    emit("change", {
      unreadOnly: model.unreadOnly || undefined,
      archived: model.archived,
      category: model.category || undefined,
      level: model.level,
      createdFrom: model.createdFrom || undefined,
      createdTo: model.createdTo || undefined,
    })
  }
</script>

<template>
  <NGrid :x-gap="16" :y-gap="12" responsive="screen" item-responsive>
    <NGi span="24 s:12 m:8" class="flex-y-center">
      <NCheckbox v-model:checked="model.unreadOnly" @update:checked="apply">{{
        $t("page.notification.filters.unreadOnly" as I18nFullKey)
      }}</NCheckbox>
    </NGi>
    <NGi span="24 s:12 m:8">
      <NSelect
        v-model:value="model.archived"
        :options="[
          { label: $t('page.notification.filters.active' as I18nFullKey), value: 'active' },
          { label: $t('page.notification.filters.archived' as I18nFullKey), value: 'archived' },
          { label: $t('page.notification.filters.all' as I18nFullKey), value: 'all' },
        ]"
        @update:value="apply"
      />
    </NGi>
    <NGi span="24 m:8">
      <div class="flex-y-center gap-8px">
        <NSelect
          v-model:value="model.level"
          class="w-160px"
          clearable
          :placeholder="$t('page.notification.filters.level' as I18nFullKey)"
          :options="levelOptions"
          @update:value="apply"
        />
      </div>
    </NGi>
    <NGi span="24 m:8">
      <NInput
        v-model:value="model.category"
        clearable
        :placeholder="$t('page.notification.filters.category' as I18nFullKey)"
        @change="apply"
      />
    </NGi>
    <NGi span="24 m:8">
      <NInput
        v-model:value="model.createdFrom"
        clearable
        :placeholder="$t('page.notification.filters.createdFrom' as I18nFullKey)"
        @change="apply"
      />
    </NGi>
    <NGi span="24 m:8">
      <NInput
        v-model:value="model.createdTo"
        clearable
        :placeholder="$t('page.notification.filters.createdTo' as I18nFullKey)"
        @change="apply"
      />
    </NGi>
  </NGrid>
</template>
