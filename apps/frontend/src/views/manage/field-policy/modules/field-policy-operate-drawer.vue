<script setup lang="ts">
  import { computed, reactive, ref, watch } from "vue"
  import { $t } from "@/locales"
  import {
    fetchCreateFieldPolicy,
    fetchGetPolicyModels,
    fetchUpdateFieldPolicy,
  } from "@/service/api/system-manage"
  import RuleEditor from "../../data-policy/modules/rule-editor/rule-editor.vue"
  import type { GroupNode, ModelOption } from "../../data-policy/modules/rule-editor/types"

  defineOptions({ name: "FieldPolicyOperateDrawer" })

  interface Props {
    operateType: "add" | "edit"
    rowData?: Api.FieldPolicy.Policy | null
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ submitted: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })

  const title = computed(() =>
    props.operateType === "add"
      ? $t("page.manage.fieldPolicy.addPolicy")
      : $t("page.manage.fieldPolicy.editPolicy"),
  )

  const models = ref<ModelOption[]>([])
  const fieldOptions = ref<{ label: string; value: string }[]>([])
  const showCondition = ref(false)

  const formData = reactive({
    name: "",
    description: "",
    targetModel: "",
    fields: [] as string[],
    actions: ["read", "write"] as ("read" | "write")[],
    effect: "strip" as Api.FieldPolicy.Effect,
    condition: { type: "group", logic: "AND", conditions: [] } as GroupNode,
    status: "1" as Api.Common.EnableStatus,
  })

  function resetForm() {
    formData.name = ""
    formData.description = ""
    formData.targetModel = ""
    formData.fields = []
    formData.actions = ["read", "write"]
    formData.effect = "strip"
    formData.condition = { type: "group", logic: "AND", conditions: [] }
    formData.status = "1" as Api.Common.EnableStatus
    showCondition.value = false
  }

  function initEditForm() {
    if (!props.rowData) return
    formData.name = props.rowData.name
    formData.description = props.rowData.description || ""
    formData.targetModel = props.rowData.targetModel
    formData.fields = [...props.rowData.fields]
    formData.actions = [...props.rowData.actions]
    formData.effect = props.rowData.effect
    formData.status = props.rowData.status
    if (props.rowData.condition) {
      formData.condition = props.rowData.condition as GroupNode
      showCondition.value = true
    } else {
      formData.condition = { type: "group", logic: "AND", conditions: [] }
      showCondition.value = false
    }
    updateFieldOptions(props.rowData.targetModel)
  }

  async function loadModels() {
    const { data } = await fetchGetPolicyModels()
    if (data) {
      models.value = data
    }
  }

  function updateFieldOptions(modelName: string) {
    const model = models.value.find((m) => m.name === modelName)
    if (model && model.fields) {
      fieldOptions.value = model.fields.map((f) => ({ label: f.label || f.name, value: f.name }))
    } else {
      fieldOptions.value = []
    }
  }

  function handleModelChange(value: string) {
    formData.fields = []
    updateFieldOptions(value)
  }

  const modelSelectOptions = computed(() => models.value.map((m) => ({ label: m.name, value: m.name })))

  async function handleSubmit() {
    const payload: Api.FieldPolicy.PolicyCreate = {
      name: formData.name,
      targetModel: formData.targetModel,
      description: formData.description || undefined,
      fields: formData.fields,
      actions: formData.actions,
      effect: formData.effect,
      condition: showCondition.value ? (formData.condition as any) : undefined,
      status: formData.status,
    }

    if (props.operateType === "add") {
      const { error } = await fetchCreateFieldPolicy(payload)
      if (error) return
      window.$message?.success($t("common.addSuccess"))
    } else if (props.rowData) {
      const { error } = await fetchUpdateFieldPolicy(props.rowData.id, payload)
      if (error) return
      window.$message?.success($t("common.updateSuccess"))
    }
    visible.value = false
    emit("submitted")
  }

  watch(visible, (val) => {
    if (val) {
      loadModels()
      if (props.operateType === "edit") {
        initEditForm()
      } else {
        resetForm()
      }
    }
  })
</script>

<template>
  <NDrawer v-model:show="visible" :width="680">
    <NDrawerContent :title="title" closable>
      <NForm :model="formData" label-placement="top">
        <NFormItem :label="$t('page.manage.fieldPolicy.name')" path="name">
          <NInput v-model:value="formData.name" :placeholder="$t('page.manage.fieldPolicy.form.name')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.fieldPolicy.description')" path="description">
          <NInput v-model:value="formData.description" type="textarea" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.fieldPolicy.targetModel')" path="targetModel">
          <NSelect
            v-model:value="formData.targetModel"
            :options="modelSelectOptions"
            :placeholder="$t('page.manage.fieldPolicy.form.targetModel')"
            @update:value="handleModelChange"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.fieldPolicy.fields')" path="fields">
          <NSelect
            v-model:value="formData.fields"
            :options="fieldOptions"
            :placeholder="$t('page.manage.fieldPolicy.form.fields')"
            multiple
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.fieldPolicy.actions')" path="actions">
          <NCheckboxGroup v-model:value="formData.actions">
            <NCheckbox value="read">{{ $t("page.manage.fieldPolicy.actionOptions.read") }}</NCheckbox>
            <NCheckbox value="write">{{ $t("page.manage.fieldPolicy.actionOptions.write") }}</NCheckbox>
          </NCheckboxGroup>
        </NFormItem>
        <NFormItem :label="$t('page.manage.fieldPolicy.effect')" path="effect">
          <NRadioGroup v-model:value="formData.effect">
            <NRadio value="strip">{{ $t("page.manage.fieldPolicy.effectOptions.strip") }}</NRadio>
            <NRadio value="mask">{{ $t("page.manage.fieldPolicy.effectOptions.mask") }}</NRadio>
            <NRadio value="deny">{{ $t("page.manage.fieldPolicy.effectOptions.deny") }}</NRadio>
          </NRadioGroup>
        </NFormItem>
        <NFormItem :label="$t('page.manage.fieldPolicy.status')" path="status">
          <NSwitch v-model:value="formData.status" checked-value="1" unchecked-value="2" />
        </NFormItem>
        <NFormItem v-if="!showCondition">
          <NButton dashed block @click="showCondition = true">
            {{ $t("page.manage.fieldPolicy.form.addCondition") }}
          </NButton>
        </NFormItem>
        <NFormItem v-if="showCondition" :label="$t('page.manage.fieldPolicy.condition')" path="condition">
          <RuleEditor v-model="formData.condition" v-model:current-model="formData.targetModel" :models="models" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
