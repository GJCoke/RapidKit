<script setup lang="ts">
  import { computed, nextTick, ref, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import type { InputInst } from "naive-ui"
  import { useOperationAccess } from "@/hooks/business/table-actions/use-operation-access"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { fetchCreateNotificationTemplate, fetchUpdateNotificationTemplate } from "@/service/api"
  import { $t } from "@/locales"
  import TemplateVariablesEditor from "./template-variables-editor.vue"
  import { parseVariableSchema, previewTemplate, rowsToSchema, schemaToRows } from "./template-editor"
  import type { VariableRow } from "./template-editor"
  import { renderTemplatePreview } from "./template-preview"

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
    contentMode: Api.Notification.TemplateContentMode
    titleTemplate: string
    contentTemplate: string
    contentFormat: Api.Notification.ContentFormat | null
    mandatory: boolean
    enabled: boolean
  }

  const props = defineProps<Props>()
  const themeVars = useThemeVars()
  const emit = defineEmits<{ submitted: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const operationAccess = useOperationAccess(
    () => (props.operateType === "edit" ? "notification-template:update" : "notification-template:create"),
    visible,
  )
  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const model = ref(createDefaultModel())
  const variableRows = ref<VariableRow[]>([])
  const schemaValid = ref(true)
  const editorKey = ref(0)
  const titleInput = ref<InputInst | null>(null)
  const contentInput = ref<InputInst | null>(null)
  const activeField = ref<"titleTemplate" | "contentTemplate">("contentTemplate")
  const selection = { start: 0, end: 0 }
  const submitting = ref(false)
  const formError = ref("")
  const t = (key: string, params: Record<string, unknown> = {}) =>
    $t(`page.notification.manage.templates.editor.${key}` as I18nFullKey, {
      variable: "{username}",
      task: "{task_name}",
      ...params,
    })
  const isRaw = computed(() => model.value.contentMode === "raw")
  const reservedCategory = computed(() => ["admin.announcement", "system.security"].includes(model.value.category))

  const title = computed(() =>
    props.operateType === "add"
      ? $t("page.notification.manage.templates.add" as I18nFullKey)
      : $t("page.notification.manage.templates.edit" as I18nFullKey),
  )
  const rules = {
    code: { ...defaultRequiredRule, whitespace: true },
    name: { ...defaultRequiredRule, whitespace: true },
    category: { ...defaultRequiredRule, whitespace: true },
    level: defaultRequiredRule,
    contentMode: defaultRequiredRule,
    titleTemplate: { ...defaultRequiredRule, whitespace: true },
    contentTemplate: { ...defaultRequiredRule, whitespace: true },
  }
  const levelOptions = computed(() =>
    ["info", "success", "warning", "error"].map((value) => ({
      label: `${$t(`page.notification.level.${value}` as I18nFullKey)} · ${value}`,
      value,
    })),
  )
  const categoryOptions = computed(() =>
    [
      ["admin.announcement", "adminAnnouncement"],
      ["system.security", "systemSecurity"],
      ["user.invited", "userInvited"],
      ["user.mention", "userMention"],
      ["task.completed", "taskCompleted"],
    ].map(([value, key]) => ({ label: `${$t(`notification.category.${key}` as I18nFullKey)} · ${value}`, value })),
  )
  const insertableVariables = computed(() =>
    [...new Set(variableRows.value.map((row) => row.name))].filter((name) => /^[a-zA-Z_]\w*$/.test(name)),
  )
  const preview = computed(() => {
    if (!schemaValid.value) return { title: "", content: "", issues: [t("schemaInvalid")] }
    return renderTemplatePreview(model.value, variableRows.value)
  })

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
      variableRows.value = schemaToRows(row.variableSchema)
    } else {
      variableRows.value = []
    }
    schemaValid.value = true
    editorKey.value++
    formError.value = ""
    activeField.value = "contentTemplate"
    selection.start = selection.end = 0
    submitting.value = false
    void restoreValidation()
  }

  function rememberSelection(event: FocusEvent, field: "titleTemplate" | "contentTemplate") {
    const element = event.target as HTMLInputElement | HTMLTextAreaElement
    activeField.value = field
    selection.start = element.selectionStart ?? model.value[field].length
    selection.end = element.selectionEnd ?? selection.start
  }

  async function insertVariable(name: string) {
    const field = activeField.value
    const value = model.value[field]
    const token = `{${name}}`
    model.value[field] = value.slice(0, selection.start) + token + value.slice(selection.end)
    const cursor = selection.start + token.length
    selection.start = selection.end = cursor
    await nextTick()
    const input = field === "titleTemplate" ? titleInput.value : contentInput.value
    input?.focus()
    const element = field === "titleTemplate" ? input?.inputElRef : input?.textareaElRef
    element?.setSelectionRange(cursor, cursor)
  }

  async function submit() {
    if (!operationAccess.value) return
    if (submitting.value) return
    submitting.value = true
    formError.value = ""
    try {
      try {
        await validate()
        if (!operationAccess.value) return
      } catch {
        formError.value = t("formInvalid")
        return
      }
      if (!schemaValid.value) {
        formError.value = t("schemaInvalid")
        return
      }
      let variableSchema: ReturnType<typeof rowsToSchema>
      try {
        variableSchema = parseVariableSchema(JSON.stringify(rowsToSchema(variableRows.value)))
      } catch {
        formError.value = t("schemaInvalid")
        return
      }
      if (
        !isRaw.value &&
        [model.value.titleTemplate, model.value.contentTemplate].some(
          (value) => !/^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)+$/.test(value),
        )
      ) {
        formError.value = t("i18nInvalid")
        return
      }
      if (isRaw.value) {
        const invalid = [
          ...previewTemplate(model.value.titleTemplate, variableRows.value).issues,
          ...previewTemplate(model.value.contentTemplate, variableRows.value).issues,
        ].find((issue) => issue.kind === "undeclared" || issue.kind === "invalidFormat")
        if (invalid) {
          formError.value = t(`previewIssues.${invalid.kind}`, { name: invalid.name })
          return
        }
      }
      if (props.operateType === "add") {
        const payload: Api.Notification.TemplateCreate = {
          code: model.value.code.trim(),
          name: model.value.name.trim(),
          category: model.value.category.trim(),
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
        if (!operationAccess.value) return
        const { error } = await fetchCreateNotificationTemplate(payload)
        if (error) {
          formError.value = t("saveFailed")
          return
        }
      } else if (props.rowData) {
        const payload: Api.Notification.TemplateUpdate = {
          name: model.value.name.trim(),
          category: model.value.category.trim(),
          level: model.value.level,
          titleTemplate: model.value.titleTemplate,
          contentTemplate: model.value.contentTemplate,
          contentFormat: model.value.contentFormat,
          variableSchema,
          defaultChannels: props.rowData.defaultChannels,
          mandatory: model.value.mandatory,
          enabled: model.value.enabled,
        }
        if (!operationAccess.value) return
        const { error } = await fetchUpdateNotificationTemplate(props.rowData.id, payload)
        if (error) {
          formError.value = t("saveFailed")
          return
        }
      } else {
        return
      }

      window.$message?.success($t(props.operateType === "add" ? "common.addSuccess" : "common.updateSuccess"))
      visible.value = false
      emit("submitted")
    } catch {
      formError.value = t("saveFailed")
    } finally {
      submitting.value = false
    }
  }

  watch(
    visible,
    (isVisible) => {
      if (isVisible) initialize()
    },
    { immediate: true },
  )
</script>

<template>
  <NDrawer
    v-model:show="visible"
    display-directive="show"
    width="min(760px, 100vw)"
    :close-on-esc="!submitting"
    :mask-closable="!submitting"
  >
    <NDrawerContent
      :title="title"
      :closable="!submitting"
      :native-scrollbar="false"
      class="template-drawer"
      :style="{ '--border-color': themeVars.borderColor }"
    >
      <template #header>
        <div>
          <h1 class="m-0 text-18px font-600">{{ title }}</h1>
          <p class="mb-0 mt-5px text-13px font-400 leading-20px text-base-text-3">{{ t("intro") }}</p>
        </div>
      </template>
      <NForm
        ref="formRef"
        :model="model"
        :rules="rules"
        label-placement="top"
        :disabled="submitting"
        :show-require-mark="true"
      >
        <section aria-labelledby="template-basic-heading">
          <h2 id="template-basic-heading" class="section-heading">{{ t("basic") }}</h2>
          <div class="grid grid-cols-1 gap-x-20px sm:grid-cols-2">
            <NFormItem :label="t('name')" path="name">
              <div class="w-full">
                <NInput
                  v-model:value="model.name"
                  :placeholder="t('namePlaceholder')"
                  :maxlength="128"
                  :input-props="{ 'aria-label': t('name') }"
                />
                <p class="field-hint">{{ t("nameHint") }}</p>
              </div>
            </NFormItem>
            <NFormItem :label="t('code')" path="code">
              <div class="w-full">
                <NInput
                  v-model:value="model.code"
                  :disabled="operateType === 'edit'"
                  placeholder="task.completed.notice"
                  :maxlength="128"
                  :input-props="{ 'aria-label': t('code') }"
                />
                <p class="field-hint">{{ t("codeHint") }}</p>
              </div>
            </NFormItem>
            <NFormItem :label="t('category')" path="category">
              <div class="w-full">
                <NSelect
                  :value="model.category || null"
                  filterable
                  tag
                  :virtual-scroll="false"
                  :options="categoryOptions"
                  :placeholder="t('categoryPlaceholder')"
                  @update:value="model.category = $event"
                  :aria-label="t('category')"
                />
                <p class="field-hint">{{ t("categoryHint") }}</p>
              </div>
            </NFormItem>
            <NFormItem :label="t('level')" path="level">
              <div class="w-full">
                <NSelect v-model:value="model.level" :options="levelOptions" :aria-label="t('level')" />
                <p class="field-hint">{{ t("levelHint") }}</p>
              </div>
            </NFormItem>
          </div>
        </section>
        <section aria-labelledby="template-content-heading" class="mt-4px">
          <h2 id="template-content-heading" class="section-heading">{{ t("content") }}</h2>
          <NRadioGroup
            v-model:value="model.contentMode"
            :disabled="operateType === 'edit' || submitting"
            :aria-label="t('mode')"
            size="small"
            class="mb-6px"
          >
            <NRadioButton value="raw">{{ t("rawMode") }}</NRadioButton>
            <NRadioButton value="i18n">{{ t("i18nMode") }}</NRadioButton>
          </NRadioGroup>
          <p class="mb-14px mt-0 text-12px leading-18px text-base-text-3">
            {{ t(isRaw ? "rawHint" : "i18nHint") }}<span v-if="operateType === 'edit'"> {{ t("modeLocked") }}</span>
          </p>
          <NFormItem :label="t(isRaw ? 'titleTemplate' : 'titleKey')" path="titleTemplate">
            <NInput
              ref="titleInput"
              v-model:value="model.titleTemplate"
              :placeholder="t(isRaw ? 'titlePlaceholder' : 'titleKeyPlaceholder')"
              :maxlength="512"
              :input-props="{ 'aria-label': t(isRaw ? 'titleTemplate' : 'titleKey') }"
              @blur="rememberSelection($event, 'titleTemplate')"
            />
          </NFormItem>
          <NFormItem :label="t(isRaw ? 'contentTemplate' : 'contentKey')" path="contentTemplate">
            <NInput
              ref="contentInput"
              v-model:value="model.contentTemplate"
              :type="isRaw ? 'textarea' : 'text'"
              :autosize="{ minRows: 3, maxRows: 8 }"
              :placeholder="t(isRaw ? 'contentPlaceholder' : 'contentKeyPlaceholder')"
              :maxlength="20000"
              :input-props="{ 'aria-label': t(isRaw ? 'contentTemplate' : 'contentKey') }"
              @blur="rememberSelection($event, 'contentTemplate')"
            />
          </NFormItem>
          <div v-if="isRaw" class="mt--6px flex flex-wrap items-center gap-6px text-12px text-base-text-3">
            <span>{{ t("insertVariable") }}</span>
            <NButton
              v-for="name in insertableVariables"
              :key="name"
              size="tiny"
              secondary
              round
              type="primary"
              :disabled="!schemaValid || submitting"
              @click="insertVariable(name)"
              >{{ name }}</NButton
            >
            <span v-if="insertableVariables.length === 0">{{ t("insertEmpty") }}</span>
          </div>
          <TemplateVariablesEditor
            :key="editorKey"
            v-model="variableRows"
            v-model:valid="schemaValid"
            :disabled="submitting"
          />
        </section>
        <section aria-labelledby="template-preview-heading" class="mt-24px">
          <h2 id="template-preview-heading" class="section-heading">{{ t("preview") }}</h2>
          <div class="flex gap-12px rounded-6px border border-theme-default bg-primary/5 p-16px">
            <SvgIcon
              :icon="
                {
                  info: 'carbon:information',
                  success: 'carbon:checkmark-filled',
                  warning: 'carbon:warning-alt-filled',
                  error: 'carbon:error-filled',
                }[model.level]
              "
              class="mt-1px shrink-0 text-24px"
              :class="
                { info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' }[
                  model.level
                ]
              "
              :aria-label="$t(`page.notification.level.${model.level}` as I18nFullKey)"
            />
            <div class="min-w-0 flex-1">
              <p class="m-0 break-words text-14px font-600 leading-22px text-base-text-1">
                {{ preview.title || t("previewTitleEmpty") }}
              </p>
              <p class="mb-0 mt-4px whitespace-pre-wrap break-words text-13px leading-21px text-base-text-2">
                {{ preview.content || t("previewContentEmpty") }}
              </p>
            </div>
          </div>
          <ul
            v-if="preview.issues.length"
            class="mb-0 mt-8px list-disc pl-18px text-12px leading-19px text-warning"
            aria-live="polite"
          >
            <li v-for="issue in preview.issues" :key="issue">{{ issue }}</li>
          </ul>
          <p class="field-hint">{{ t("previewHint") }}</p>
        </section>
        <section aria-labelledby="template-rules-heading" class="mt-24px">
          <h2 id="template-rules-heading" class="section-heading">{{ t("rules") }}</h2>
          <div class="grid grid-cols-1 gap-16px sm:grid-cols-2">
            <div class="flex items-start gap-10px">
              <NSwitch v-model:value="model.enabled" :aria-label="t('enabled')" :disabled="submitting" />
              <div>
                <span class="text-13px">{{ t("enabled") }}</span>
                <p class="field-hint">{{ t("enabledHint") }}</p>
              </div>
            </div>
            <div class="flex items-start gap-10px">
              <NSwitch v-model:value="model.mandatory" :aria-label="t('mandatory')" :disabled="submitting" />
              <div>
                <span class="text-13px">{{ t("mandatory") }}</span>
                <p class="field-hint">{{ t("mandatoryHint") }}</p>
              </div>
            </div>
          </div>
          <p v-if="reservedCategory" class="mb-0 mt-12px text-12px leading-18px text-warning">
            {{ t("reservedHint") }}
          </p>
          <p class="mb-0 mt-14px text-12px text-base-text-3">{{ t("channelHint") }}</p>
        </section>
      </NForm>
      <NAlert v-if="formError" type="error" class="mt-16px" :show-icon="false" role="alert">{{ formError }}</NAlert>
      <template #footer>
        <div class="w-full flex flex-wrap items-center justify-between gap-12px">
          <span class="text-12px text-base-text-3">{{ t("createHint") }}</span>
          <NSpace :size="12">
            <NButton :disabled="submitting" @click="visible = false">{{ $t("common.cancel") }}</NButton>
            <NButton type="primary" :loading="submitting" @click="submit">{{
              t(operateType === "add" ? "create" : "save")
            }}</NButton>
          </NSpace>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
  .section-heading {
    @apply mb-16px mt-0 flex items-center gap-8px border-t border-theme-default pt-18px text-14px font-600;
  }
  .section-heading::before {
    content: "";
    @apply h-14px w-3px rounded-full bg-primary;
  }
  section:first-child .section-heading {
    @apply border-t-0 pt-0;
  }
  .field-hint {
    @apply mb-0 mt-6px text-12px leading-18px text-base-text-3;
  }
  .template-drawer :deep(.n-drawer-body-content-wrapper) {
    padding: 22px 24px;
  }
  .template-drawer :deep(.n-form-item-feedback-wrapper) {
    min-height: 18px;
  }
  @media (max-width: 639px) {
    .template-drawer :deep(.n-drawer-body-content-wrapper) {
      padding: 18px 16px;
    }
  }
</style>
