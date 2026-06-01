<script setup lang="ts">
  import { computed, reactive, ref, watch } from "vue"
  import type { FormInst } from "naive-ui"
  import { fetchCreateDataPolicy, fetchGetPolicyModels, fetchUpdateDataPolicy } from "@/service/api/system-manage"
  import { $t } from "@/locales"
  import RuleEditor from "./rule-editor/rule-editor.vue"
  import type { GroupNode, ModelOption } from "./rule-editor/types"

  defineOptions({ name: "DataPolicyOperateDrawer" })

  interface Props {
    operateType: "add" | "edit"
    rowData?: Api.DataPolicy.Policy | null
  }

  const props = defineProps<Props>()

  const visible = defineModel<boolean>("visible", { default: false })
  const emit = defineEmits<{ submitted: [] }>()

  const title = computed(() =>
    props.operateType === "add" ? $t("page.manage.dataPolicy.addPolicy") : $t("page.manage.dataPolicy.editPolicy"),
  )

  const formRef = ref<FormInst | null>(null)
  const models = ref<ModelOption[]>([])

  const formData = reactive({
    name: "",
    description: "",
    rule: { type: "group", logic: "AND", conditions: [] } as GroupNode,
    status: "1" as Api.Common.EnableStatus,
    targetModel: "",
    effect: "allow" as "allow" | "deny",
    actions: ["read", "write"] as ("read" | "write")[],
  })

  function resetForm() {
    formData.name = ""
    formData.description = ""
    formData.rule = { type: "group", logic: "AND", conditions: [] }
    formData.status = "1" as Api.Common.EnableStatus
    formData.targetModel = ""
    formData.effect = "allow"
    formData.actions = ["read", "write"]
  }

  async function loadModels() {
    const { data } = await fetchGetPolicyModels()
    if (data) {
      models.value = data
    }
  }

  watch(visible, (val) => {
    if (val) {
      loadModels()
      if (props.operateType === "edit" && props.rowData) {
        formData.name = props.rowData.name
        formData.description = props.rowData.description
        formData.rule = props.rowData.rule as GroupNode
        formData.status = props.rowData.status
        formData.targetModel = props.rowData.targetModel
        formData.effect = props.rowData.effect || "allow"
        formData.actions = props.rowData.actions || ["read", "write"]
      } else {
        resetForm()
      }
    }
  })

  const rules = {
    name: { required: true, message: $t("form.required"), trigger: "blur" },
    targetModel: { required: true, message: $t("form.required"), trigger: "change" },
  }

  async function handleSubmit() {
    await formRef.value?.validate()
    if (props.operateType === "add") {
      await fetchCreateDataPolicy(formData)
    } else if (props.rowData) {
      await fetchUpdateDataPolicy(props.rowData.id, formData)
    }
    visible.value = false
    emit("submitted")
  }
</script>

<template>
  <NDrawer v-model:show="visible" :width="680">
    <NDrawerContent :title="title" closable>
      <NForm ref="formRef" :model="formData" :rules="rules" label-placement="top">
        <NFormItem path="name" :label="$t('page.manage.dataPolicy.name')">
          <NInput v-model:value="formData.name" :placeholder="$t('page.manage.dataPolicy.form.name')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataPolicy.description')">
          <NInput
            v-model:value="formData.description"
            type="textarea"
            :placeholder="$t('page.manage.dataPolicy.form.description')"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataPolicy.effect')" path="effect">
          <NRadioGroup v-model:value="formData.effect">
            <NRadio value="allow">{{ $t("page.manage.dataPolicy.effectOptions.allow") }}</NRadio>
            <NRadio value="deny">{{ $t("page.manage.dataPolicy.effectOptions.deny") }}</NRadio>
          </NRadioGroup>
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataPolicy.actions')" path="actions">
          <NCheckboxGroup v-model:value="formData.actions">
            <NCheckbox value="read">{{ $t("page.manage.dataPolicy.actionOptions.read") }}</NCheckbox>
            <NCheckbox value="write">{{ $t("page.manage.dataPolicy.actionOptions.write") }}</NCheckbox>
          </NCheckboxGroup>
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataPolicy.status')">
          <NSwitch v-model:value="formData.status" checked-value="1" unchecked-value="2" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.dataPolicy.rule')">
          <RuleEditor v-model="formData.rule" v-model:current-model="formData.targetModel" :models="models" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
