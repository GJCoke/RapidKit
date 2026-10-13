<script setup lang="ts">
  import { useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "AnnouncementSearch" })

  const emit = defineEmits<{ search: [] }>()
  const model = defineModel<Api.Notification.AnnouncementListQuery>("model", { required: true })
  const { formRef, restoreValidation } = useNaiveForm()

  const statusOptions: Array<{ label: string; value: Api.Notification.AnnouncementItem["status"] }> = [
    "draft",
    "scheduled",
    "publishing",
    "published",
    "expired",
    "cancelled",
    "recalled",
    "superseded",
  ].map((status) => ({
    label: $t(`page.notification.manage.announcements.statusOptions.${status}` as I18nFullKey),
    value: status as Api.Notification.AnnouncementItem["status"],
  }))

  async function reset() {
    await restoreValidation()
    Object.assign(model.value, { category: undefined, status: undefined, displayMode: undefined })
    emit("search")
  }
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse :default-expanded-names="['announcement-search']">
      <NCollapseItem :title="$t('common.search')" name="announcement-search">
        <NForm ref="formRef" :model="model" label-placement="left" :label-width="90" @submit.prevent="emit('search')">
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi
              span="24 s:12 m:8"
              :label="$t('page.notification.manage.announcements.category' as I18nFullKey)"
              path="category"
              class="pr-24px"
            >
              <NInput
                :value="model.category ?? ''"
                @update:value="model.category = $event || undefined"
                clearable
                :placeholder="$t('page.notification.manage.announcements.categoryPlaceholder' as I18nFullKey)"
              />
            </NFormItemGi>
            <NFormItemGi
              span="24 s:12 m:8"
              :label="$t('page.notification.manage.announcements.status' as I18nFullKey)"
              path="status"
              class="pr-24px"
            >
              <NSelect
                :value="model.status ?? null"
                clearable
                :options="statusOptions"
                @update:value="model.status = $event ?? undefined"
              />
            </NFormItemGi>
            <NFormItemGi
              span="24 s:12 m:8"
              :label="$t('page.notification.banner.displayMode' as I18nFullKey)"
              path="displayMode"
              class="pr-24px"
            >
              <NSelect
                :value="model.displayMode ?? null"
                @update:value="model.displayMode = $event ?? undefined"
                clearable
                :options="[
                  { label: $t('page.notification.manage.announcements.editor.inApp' as I18nFullKey), value: 'inbox' },
                  { label: $t('page.notification.banner.topBanner' as I18nFullKey), value: 'top_banner' },
                ]"
              />
            </NFormItemGi>
            <NFormItemGi span="24" class="pr-24px">
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
