<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { fetchCreateNotificationTemplate, fetchUpdateNotificationTemplate } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({ name: "TemplateOperateDrawer" })

  interface Props {
    operateType: NaiveUI.TableOperateType
    rowData?: Api.Notification.Template | null
  }

  interface TemplateFormModel {
    code: string
    name: string
    category: string
    level: Api.Notification.Level
    contentMode: Api.Notification.ContentMode
    titleTemplate: string
    contentTemplate: string
    contentFormat: Api.Notification.ContentFormat | null
    mandatory: boolean
    enabled: boolean
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ submitted: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const model = ref(createDefaultModel())
  const variableSchemaText = ref("{}")
  const schemaError = ref(false)
  const submitting = ref(false)

  const title = computed(() =>
    props.operateType === "add"
      ? $t("page.notification.manage.templates.add" as I18nFullKey)
      : $t("page.notification.manage.templates.edit" as I18nFullKey),
  )
  const rules = {
    code: defaultRequiredRule,
    name: defaultRequiredRule,
    category: defaultRequiredRule,
    level: defaultRequiredRule,
    contentMode: defaultRequiredRule,
    titleTemplate: defaultRequiredRule,
    contentTemplate: defaultRequiredRule,
  }
  const levelOptions = ["info", "success", "warning", "error"].map((value) => ({ label: value, value }))
  const modeOptions = ["raw", "i18n"].map((value) => ({ label: value, value }))

  function createDefaultModel(): TemplateFormModel {
    return {
      code: "",
      name: "",
      category: "",
      level: "info",
      contentMode: "raw",
      titleTemplate: "",
      contentTemplate: "",
      contentFormat: "plain_text",
      mandatory: false,
      enabled: true,
    }
  }

  function initialize() {
    model.value = createDefaultModel()
    if (props.operateType === "edit" && props.rowData) {
      const row = props.rowData
      model.value = {
        code: row.code,
        name: row.name,
        category: row.category,
        level: row.level,
        contentMode: row.contentMode,
        titleTemplate: row.titleTemplate,
        contentTemplate: row.contentTemplate,
        contentFormat: row.contentFormat ?? null,
        mandatory: row.mandatory,
        enabled: row.enabled,
      }
      variableSchemaText.value = JSON.stringify(row.variableSchema, null, 2)
    } else {
      variableSchemaText.value = "{}"
    }
    schemaError.value = false
    submitting.value = false
    void restoreValidation()
  }

  function parseVariableSchema(): Record<string, Record<string, unknown>> | null {
    try {
      const parsed: unknown = JSON.parse(variableSchemaText.value || "{}")
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid schema")
      if (Object.values(parsed).some((value) => !value || typeof value !== "object" || Array.isArray(value))) {
        throw new Error("invalid schema entry")
      }
      schemaError.value = false
      return parsed as Record<string, Record<string, unknown>>
    } catch {
      schemaError.value = true
      window.$message?.error($t("page.notification.manage.templates.variableSchemaInvalid" as I18nFullKey))
      return null
    }
  }

  async function submit() {
    if (submitting.value) return
    await validate()
    const variableSchema = parseVariableSchema()
    if (!variableSchema) return

    submitting.value = true
    try {
      if (props.operateType === "add") {
        const payload: Api.Notification.TemplateCreate = {
          code: model.value.code,
          name: model.value.name,
          category: model.value.category,
          level: model.value.level,
          contentMode: model.value.contentMode,
          titleTemplate: model.value.titleTemplate,
          contentTemplate: model.value.contentTemplate,
          contentFormat: model.value.contentFormat,
          variableSchema,
          defaultChannels: ["in_app"],
          mandatory: model.value.mandatory,
          enabled: model.value.enabled,
        }
        const { error } = await fetchCreateNotificationTemplate(payload)
        if (error) return
      } else if (props.rowData) {
        const payload: Api.Notification.TemplateUpdate = {
          name: model.value.name,
          category: model.value.category,
          level: model.value.level,
          titleTemplate: model.value.titleTemplate,
          contentTemplate: model.value.contentTemplate,
          contentFormat: model.value.contentFormat,
          variableSchema,
          defaultChannels: ["in_app"],
          mandatory: model.value.mandatory,
          enabled: model.value.enabled,
        }
        const { error } = await fetchUpdateNotificationTemplate(props.rowData.id, payload)
        if (error) return
      } else {
        return
      }

      window.$message?.success($t("common.updateSuccess"))
      visible.value = false
      emit("submitted")
    } finally {
      submitting.value = false
    }
  }

  watch(visible, (isVisible) => {
    if (isVisible) initialize()
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="560">
    <NDrawerContent :title="title" closable :native-scrollbar="false">
      <NForm ref="formRef" :model="model" :rules="rules" label-placement="top">
        <NFormItem
          v-if="operateType === 'add'"
          :label="$t('page.notification.manage.templates.code' as I18nFullKey)"
          path="code"
        >
          <NInput v-model:value="model.code" />
        </NFormItem>
        <NFormItem :label="$t('page.notification.manage.templates.name' as I18nFullKey)" path="name"
          ><NInput v-model:value="model.name"
        /></NFormItem>
        <NFormItem :label="$t('page.notification.manage.templates.category' as I18nFullKey)" path="category"
          ><NInput v-model:value="model.category"
        /></NFormItem>
        <NFormItem :label="$t('page.notification.manage.templates.level' as I18nFullKey)" path="level"
          ><NSelect v-model:value="model.level" :options="levelOptions"
        /></NFormItem>
        <NFormItem :label="$t('page.notification.manage.templates.mode' as I18nFullKey)" path="contentMode"
          ><NSelect v-model:value="model.contentMode" :options="modeOptions" :disabled="operateType === 'edit'"
        /></NFormItem>
        <NFormItem :label="$t('page.notification.manage.templates.titleTemplate' as I18nFullKey)" path="titleTemplate"
          ><NInput v-model:value="model.titleTemplate"
        /></NFormItem>
        <NFormItem
          :label="$t('page.notification.manage.templates.contentTemplate' as I18nFullKey)"
          path="contentTemplate"
          ><NInput v-model:value="model.contentTemplate" type="textarea" :rows="4"
        /></NFormItem>
        <NFormItem
          :label="$t('page.notification.manage.templates.variableSchema' as I18nFullKey)"
          :validation-status="schemaError ? 'error' : undefined"
        >
          <NInput
            v-model:value="variableSchemaText"
            type="textarea"
            :rows="6"
            placeholder='{"username":{"type":"string","required":true}}'
            @update:value="schemaError = false"
          />
        </NFormItem>
        <div class="grid grid-cols-1 gap-16px sm:grid-cols-2">
          <NFormItem :label="$t('page.notification.manage.templates.mandatory' as I18nFullKey)"
            ><NSwitch v-model:value="model.mandatory"
          /></NFormItem>
          <NFormItem :label="$t('page.notification.manage.templates.enabled' as I18nFullKey)"
            ><NSwitch v-model:value="model.enabled"
          /></NFormItem>
        </div>
      </NForm>
      <template #footer>
        <NSpace :size="12"
          ><NButton :disabled="submitting" @click="visible = false">{{ $t("common.cancel") }}</NButton
          ><NButton type="primary" :loading="submitting" @click="submit">{{ $t("common.confirm") }}</NButton></NSpace
        >
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
