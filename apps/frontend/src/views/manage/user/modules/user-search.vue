<script setup lang="ts">
  import { toRaw } from "vue"
  import { jsonClone } from "@rapidkit/utils"
  import { enableStatusOptions } from "@/constants/business"
  import { useNaiveForm } from "@/hooks/common/form"
  import { translateOptions } from "@/utils/common"
  import { $t } from "@/locales"

  defineOptions({
    name: "UserSearch",
  })

  interface Emits {
    (e: "search"): void
  }

  const emit = defineEmits<Emits>()

  const { formRef, restoreValidation } = useNaiveForm()

  const model = defineModel<Api.SystemManage.UserSearchParams>("model", { required: true })

  const defaultModel = jsonClone(toRaw(model.value))

  function resetModel() {
    Object.assign(model.value, defaultModel)
  }

  async function reset() {
    await restoreValidation()
    resetModel()
  }

  function search() {
    emit("search")
  }
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse>
      <NCollapseItem :title="$t('common.search')" name="user-search">
        <NForm ref="formRef" :model="model" label-placement="left" :label-width="80">
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi span="24 s:12 m:6" label="Keyword" path="keyword" class="pr-24px">
              <NInput v-model:value="model.keyword" placeholder="Search by name/username/email" />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:6" :label="$t('page.manage.user.userStatus')" path="status" class="pr-24px">
              <NSelect
                v-model:value="model.status"
                :placeholder="$t('page.manage.user.form.userStatus')"
                :options="translateOptions(enableStatusOptions)"
                clearable
              />
            </NFormItemGi>
            <NFormItemGi span="24 m:12" class="pr-24px">
              <NSpace class="w-full" justify="end">
                <NButton @click="reset">
                  <template #icon>
                    <icon-ic-round-refresh class="text-icon" />
                  </template>
                  {{ $t("common.reset") }}
                </NButton>
                <NButton type="primary" ghost @click="search">
                  <template #icon>
                    <icon-ic-round-search class="text-icon" />
                  </template>
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

<style scoped></style>
