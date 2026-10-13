<script setup lang="ts">
  import { computed } from "vue"
  import { useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { templateListText as t } from "./template-presentation"

  defineOptions({ name: "TemplateSearch" })

  const emit = defineEmits<{ search: [] }>()
  const model = defineModel<Api.Notification.TemplateListQuery>("model", { required: true })
  const { formRef, restoreValidation } = useNaiveForm()
  const enabledOptions = computed(() => [
    { label: t("enabled"), value: 1 },
    { label: t("disabled"), value: 0 },
  ])
  const enabledValue = computed<number | null>({
    get: () => (model.value.enabled === undefined ? null : Number(model.value.enabled)),
    set: (value) => {
      model.value.enabled = value === null ? undefined : Boolean(value)
    },
  })

  async function reset() {
    await restoreValidation()
    Object.assign(model.value, { keyword: undefined, enabled: undefined })
    emit("search")
  }
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse :default-expanded-names="['template-search']">
      <NCollapseItem :title="$t('common.search')" name="template-search">
        <NForm
          ref="formRef"
          :model="model"
          :aria-label="t('searchLabel')"
          label-placement="left"
          :label-width="80"
          :show-feedback="false"
          @submit.prevent="emit('search')"
        >
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi
              span="24 s:12 m:10"
              :label="$t('page.notification.manage.templates.keyword' as I18nFullKey)"
              path="keyword"
              class="pr-24px"
            >
              <NInput
                v-model:value="model.keyword"
                clearable
                :aria-label="$t('page.notification.manage.templates.keyword' as I18nFullKey)"
                :placeholder="$t('page.notification.manage.templates.keywordPlaceholder' as I18nFullKey)"
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:8" :label="t('enabledFilter')" path="enabled" class="pr-24px">
              <NSelect
                v-model:value="enabledValue"
                :aria-label="t('enabledFilter')"
                clearable
                :options="enabledOptions"
                :placeholder="t('allStatuses')"
              />
            </NFormItemGi>
            <NFormItemGi span="24 m:6">
              <NSpace class="w-full" justify="end">
                <NButton @click="reset">
                  <template #icon><icon-ic-round-refresh class="text-icon" /></template>
                  {{ $t("common.reset") }}
                </NButton>
                <NButton type="primary" attr-type="submit">
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
