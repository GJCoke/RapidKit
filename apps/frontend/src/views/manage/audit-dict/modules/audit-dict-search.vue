<script setup lang="ts">
  import { $t } from "@/locales"

  defineOptions({ name: "AuditDictSearch" })

  const model = defineModel<{ category?: string }>("model", { required: true })

  const emit = defineEmits<{
    (e: "search"): void
  }>()

  const categoryOptions = [
    { label: $t("page.manage.auditDict.categoryResource"), value: "resource" },
    { label: $t("page.manage.auditDict.categoryAction"), value: "action" },
  ]

  function reset() {
    model.value = { category: undefined }
    emit("search")
  }
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NForm :model="model" label-placement="left" :label-width="70">
      <NGrid responsive="screen" item-responsive>
        <NFormItemGi span="24 s:12 m:6" :label="$t('page.manage.auditDict.category')" path="category">
          <NSelect
            v-model:value="model.category"
            clearable
            :options="categoryOptions"
            :placeholder="$t('page.manage.auditDict.form.category')"
          />
        </NFormItemGi>
        <NFormItemGi span="24 s:12 m:6">
          <NSpace>
            <NButton size="small" @click="reset">
              <template #icon>
                <icon-ic-round-refresh class="text-icon" />
              </template>
              {{ $t("common.reset") }}
            </NButton>
            <NButton type="primary" size="small" ghost @click="emit('search')">
              <template #icon>
                <icon-ic-round-search class="text-icon" />
              </template>
              {{ $t("common.search") }}
            </NButton>
          </NSpace>
        </NFormItemGi>
      </NGrid>
    </NForm>
  </NCard>
</template>
