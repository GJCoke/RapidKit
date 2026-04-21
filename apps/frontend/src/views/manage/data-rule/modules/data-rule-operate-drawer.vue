<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { jsonClone } from "@rapidkit/utils"
  import { dataRuleLogicOptions, dataRuleOperatorOptions } from "@/constants/business"
  import { fetchCreateDataRule, fetchUpdateDataRule } from "@/service/api"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { translateOptions } from "@/utils/common"

  defineOptions({ name: "DataRuleOperateDrawer" })

  interface Props {
    operateType: NaiveUI.TableOperateType
    rowData?: Api.SystemManage.DataRule | null
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "submitted"): void
  }

  const emit = defineEmits<Emits>()

  const visible = defineModel<boolean>("visible", { default: false })

  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const title = computed(() => {
    const titles: Record<NaiveUI.TableOperateType, string> = {
      add: $t("page.manage.dataRule.addRule"),
      edit: $t("page.manage.dataRule.editRule"),
    }
    return titles[props.operateType]
  })

  type Model = {
    name: string
    modelName: string
    field: string
    operator: string | null
    value: string
    logic: string
  }

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      name: "",
      modelName: "",
      field: "",
      operator: null,
      value: "",
      logic: "AND",
    }
  }

  type RuleKey = Extract<keyof Model, "name" | "modelName" | "field" | "operator" | "value">

  const rules: Record<RuleKey, App.Global.FormRule> = {
    name: defaultRequiredRule,
    modelName: defaultRequiredRule,
    field: defaultRequiredRule,
    operator: defaultRequiredRule,
    value: defaultRequiredRule,
  }

  function handleInitModel() {
    model.value = createDefaultModel()

    if (props.operateType === "edit" && props.rowData) {
      const { name, modelName, field, operator, value, logic } = jsonClone(props.rowData)
      Object.assign(model.value, { name, modelName, field, operator, value, logic })
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  async function handleSubmit() {
    await validate()

    const payload = {
      name: model.value.name,
      modelName: model.value.modelName,
      field: model.value.field,
      operator: model.value.operator!,
      value: model.value.value,
      logic: model.value.logic,
    }

    if (props.operateType === "add") {
      const { error } = await fetchCreateDataRule(payload)
      if (error) return
    } else {
      const { error } = await fetchUpdateDataRule(props.rowData!.id, payload)
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
  <NDrawer v-model:show="visible" display-directive="show" :width="420">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules">
        <NFormItem :label="$t('page.manage.dataRule.name')" path="name">
          <NInput v-model:value="model.name" :placeholder="$t('page.manage.dataRule.form.name')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataRule.modelName')" path="modelName">
          <NInput v-model:value="model.modelName" :placeholder="$t('page.manage.dataRule.form.modelName')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataRule.field')" path="field">
          <NInput v-model:value="model.field" :placeholder="$t('page.manage.dataRule.form.field')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataRule.operator')" path="operator">
          <NSelect
            v-model:value="model.operator"
            :options="translateOptions(dataRuleOperatorOptions)"
            :placeholder="$t('page.manage.dataRule.form.operator')"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataRule.value')" path="value">
          <NInput
            v-model:value="model.value"
            :placeholder="$t('page.manage.dataRule.form.value')"
            type="textarea"
            :rows="2"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataRule.logic')" path="logic">
          <NRadioGroup v-model:value="model.logic">
            <NRadio v-for="item in dataRuleLogicOptions" :key="item.value" :value="item.value" :label="item.label" />
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
