<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { jsonClone } from "@monorepo-example/utils"
  import { enableStatusOptions, scriptLanguageOptions } from "@/constants/business"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { translateOptions } from "@/utils/common"
  import { $t } from "@/locales"
  import { fetchCreateScript, fetchUpdateScript } from "@/service/api"

  defineOptions({
    name: "ScriptOperateDrawer",
  })

  interface Props {
    operateType: NaiveUI.TableOperateType
    rowData?: Api.Script.ScriptListItem | null
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "submitted"): void
  }

  const emit = defineEmits<Emits>()

  const visible = defineModel<boolean>("visible", {
    default: false,
  })

  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const title = computed(() => {
    const titles: Record<NaiveUI.TableOperateType, string> = {
      add: $t("page.script.addScript"),
      edit: $t("page.script.editScript"),
    }
    return titles[props.operateType]
  })

  type Model = Pick<Api.Script.ScriptEdit, "name" | "description" | "language" | "status">

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      name: "",
      description: "",
      language: "python",
      status: "1",
    }
  }

  type RuleKey = Extract<keyof Model, "name" | "language">

  const rules: Record<RuleKey, App.Global.FormRule> = {
    name: defaultRequiredRule,
    language: defaultRequiredRule,
  }

  function handleInitModel() {
    model.value = createDefaultModel()

    if (props.operateType === "edit" && props.rowData) {
      Object.assign(model.value, jsonClone(props.rowData))
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  async function handleSubmit() {
    await validate()

    if (props.operateType === "add") {
      const { error } = await fetchCreateScript(model.value as Api.Script.ScriptEdit)
      if (error) return
    } else {
      const { error } = await fetchUpdateScript(props.rowData!.id, model.value as Api.Script.ScriptEdit)
      if (error) return
    }

    window.$message?.success($t("common.updateSuccess"))
    closeDrawer()
    emit("submitted")
  }

  watch(visible, () => {
    if (visible.value) {
      handleInitModel()
      restoreValidation()
    }
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="360">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules">
        <NFormItem :label="$t('page.script.scriptName')" path="name">
          <NInput v-model:value="model.name" :placeholder="$t('page.script.form.scriptName')" />
        </NFormItem>
        <NFormItem :label="$t('page.script.scriptDesc')" path="description">
          <NInput v-model:value="model.description" :placeholder="$t('page.script.form.scriptDesc')" />
        </NFormItem>
        <NFormItem :label="$t('page.script.language')" path="language">
          <NSelect
            v-model:value="model.language"
            :placeholder="$t('page.script.form.language')"
            :options="translateOptions(scriptLanguageOptions)"
          />
        </NFormItem>
        <NFormItem :label="$t('page.script.scriptStatus')" path="status">
          <NRadioGroup v-model:value="model.status">
            <NRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value" :label="$t(item.label)" />
          </NRadioGroup>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace :size="16">
          <NButton @click="closeDrawer">{{ $t("common.cancel") }}</NButton>
          <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped></style>
