<script setup lang="ts">
  import { computed, toRaw } from "vue"
  import { jsonClone } from "@rapidkit/utils"
  import { useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "TemplateSearch" })

  const emit = defineEmits<{ search: [] }>()
  const model = defineModel<Api.Notification.TemplateListQuery>("model", { required: true })
  const { formRef, restoreValidation } = useNaiveForm()
  const defaultModel = jsonClone(toRaw(model.value))
  const enabledOptions = [
    { label: $t("common.yesOrNo.yes"), value: 1 },
    { label: $t("common.yesOrNo.no"), value: 0 },
  ]
  const enabledValue = computed<number | null>({
    get: () => (model.value.enabled === undefined ? null : Number(model.value.enabled)),
    set: (value) => {
      model.value.enabled = value === null ? undefined : Boolean(value)
    },
  })

  async function reset() {
    await restoreValidation()
    Object.assign(model.value, defaultModel)
  }
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse>
      <NCollapseItem :title="$t('common.search')" name="template-search">
        <NForm ref="formRef" :model="model" label-placement="left" :label-width="90">
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi
              span="24 s:12 m:8"
              :label="$t('page.notification.manage.templates.keyword' as I18nFullKey)"
              path="keyword"
              class="pr-24px"
            >
              <NInput
                v-model:value="model.keyword"
                clearable
                :placeholder="$t('page.notification.manage.templates.keywordPlaceholder' as I18nFullKey)"
              />
            </NFormItemGi>
            <NFormItemGi
              span="24 s:12 m:8"
              :label="$t('page.notification.manage.templates.enabled' as I18nFullKey)"
              path="enabled"
              class="pr-24px"
            >
              <NSelect v-model:value="enabledValue" clearable :options="enabledOptions" />
            </NFormItemGi>
            <NFormItemGi span="24 m:8" class="pr-24px">
              <NSpace class="w-full" justify="end">
                <NButton @click="reset">
                  <template #icon><icon-ic-round-refresh class="text-icon" /></template>
                  {{ $t("common.reset") }}
                </NButton>
                <NButton type="primary" ghost @click="emit('search')">
                  <template #icon><icon-ic-round-search class="text-icon" /></template>
                  {{ $t("common.search") }}
                </NButton>
              </NSpace>
            </NFormItemGi>
          </NGrid>
        </NForm>
      </NCollapseItem>
    </NCollapse>
  </NCard>
</template>
