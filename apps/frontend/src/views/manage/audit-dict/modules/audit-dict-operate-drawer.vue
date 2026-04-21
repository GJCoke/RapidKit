<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { jsonClone } from "@rapidkit/utils"
  import { fetchCreateAuditDict, fetchUpdateAuditDict } from "@/service/api"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "AuditDictOperateDrawer" })

  interface Props {
    operateType: NaiveUI.TableOperateType
    rowData?: Partial<Api.SystemManage.AuditDict> | null
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
      add: $t("page.manage.auditDict.addAuditDict"),
      edit: $t("page.manage.auditDict.editAuditDict"),
    }
    return titles[props.operateType]
  })

  type Model = Pick<Api.SystemManage.AuditDict, "key" | "category" | "labelZh" | "labelEn">

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      key: "",
      category: "resource",
      labelZh: "",
      labelEn: "",
    }
  }

  type RuleKey = Extract<keyof Model, "key" | "category" | "labelZh" | "labelEn">

  const rules: Record<RuleKey, App.Global.FormRule> = {
    key: defaultRequiredRule,
    category: defaultRequiredRule,
    labelZh: defaultRequiredRule,
    labelEn: defaultRequiredRule,
  }

  const categoryOptions = [
    { label: $t("page.manage.auditDict.categoryResource"), value: "resource" },
    { label: $t("page.manage.auditDict.categoryAction"), value: "action" },
  ]

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
      const { error } = await fetchCreateAuditDict(model.value)
      if (error) return
    } else {
      const { error } = await fetchUpdateAuditDict(props.rowData!.id!, model.value)
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
        <NFormItem :label="$t('page.manage.auditDict.key')" path="key">
          <NInput v-model:value="model.key" :placeholder="$t('page.manage.auditDict.form.key')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.auditDict.category')" path="category">
          <NSelect
            v-model:value="model.category"
            :options="categoryOptions"
            :placeholder="$t('page.manage.auditDict.form.category')"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.auditDict.labelZh')" path="labelZh">
          <NInput v-model:value="model.labelZh" :placeholder="$t('page.manage.auditDict.form.labelZh')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.auditDict.labelEn')" path="labelEn">
          <NInput v-model:value="model.labelEn" :placeholder="$t('page.manage.auditDict.form.labelEn')" />
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
