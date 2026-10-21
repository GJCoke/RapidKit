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
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse :default-expanded-names="['user-search']">
      <NCollapseItem :title="$t('common.search')" name="user-search">
        <NForm :model="model" label-placement="left" :label-width="100" @submit.prevent="emit('search')">
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi span="24 s:12 m:8" :label="$t('page.manage.user.keyword')" path="keyword" class="pr-24px">
              <NInput
                v-model:value="model.keyword"
                clearable
                :placeholder="$t('page.manage.user.form.keyword')"
                :aria-label="$t('page.manage.user.keyword')"
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:8" :label="$t('page.manage.user.userStatus')" path="status" class="pr-24px">
              <NSelect
                v-model:value="model.status"
                clearable
                :options="statusOptions"
                :placeholder="$t('page.manage.user.directory.allStatuses')"
                :aria-label="$t('page.manage.user.userStatus')"
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:24 m:8">
              <NSpace class="w-full" justify="end">
                <NButton @click="reset">
                  <template #icon><icon-ic-round-refresh class="text-icon" /></template>
                  {{ $t("common.reset") }}
                </NButton>
                <NButton attr-type="submit" type="primary" ghost>
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
