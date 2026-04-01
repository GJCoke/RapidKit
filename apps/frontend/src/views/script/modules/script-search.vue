<script setup lang="ts">
  import { toRaw } from "vue"
  import { jsonClone } from "@monorepo-example/utils"
  import { enableStatusOptions, scriptLanguageOptions } from "@/constants/business"
  import { translateOptions } from "@/utils/common"
  import { $t } from "@/locales"

  defineOptions({
    name: "ScriptSearch",
  })

  interface Emits {
    (e: "search"): void
  }

  const emit = defineEmits<Emits>()

  const model = defineModel<Api.Script.ScriptSearchParams>("model", { required: true })

  const defaultModel = jsonClone(toRaw(model.value))

  function resetModel() {
    Object.assign(model.value, defaultModel)
  }

  function search() {
    emit("search")
  }
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse :default-expanded-names="['script-search']">
      <NCollapseItem :title="$t('common.search')" name="script-search">
        <NForm :model="model" label-placement="left" :label-width="80">
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi span="24 s:12 m:6" :label="$t('page.script.scriptName')" path="keyword" class="pr-24px">
              <NInput v-model:value="model.keyword" :placeholder="$t('page.script.form.scriptName')" />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:6" :label="$t('page.script.language')" path="language" class="pr-24px">
              <NSelect
                v-model:value="model.language"
                :placeholder="$t('page.script.form.language')"
                :options="translateOptions(scriptLanguageOptions)"
                clearable
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:6" :label="$t('page.script.scriptStatus')" path="status" class="pr-24px">
              <NSelect
                v-model:value="model.status"
                :placeholder="$t('page.script.form.status')"
                :options="translateOptions(enableStatusOptions)"
                clearable
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:6">
              <NSpace class="w-full" justify="end">
                <NButton @click="resetModel">
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
