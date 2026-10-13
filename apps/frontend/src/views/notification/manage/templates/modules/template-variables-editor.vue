<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { $t } from "@/locales"
  import { createVariableRow, parseVariableSchema, rowsToSchema, schemaToRows, variableTypes } from "./template-editor"
  import type { VariableRow } from "./template-editor"

  defineOptions({ name: "TemplateVariablesEditor" })
  defineProps<{ disabled?: boolean }>()

  const rows = defineModel<VariableRow[]>({ required: true })
  const valid = defineModel<boolean>("valid", { default: true })
  const expanded = ref(true)
  const editorMode = ref<"table" | "json">("table")
  const json = ref("")
  const jsonInvalid = ref(false)
  const t = (key: string) =>
    $t(`page.notification.manage.templates.editor.${key}` as I18nFullKey, {
      schema: '{"username":{"type":"string","required":true,"example":"Alex"}}',
    })
  const typeOptions = computed(() => variableTypes.map((value) => ({ value, label: t(`types.${value}`) })))
  const invalid = computed(() => {
    if (editorMode.value === "json") return jsonInvalid.value
    try {
      rowsToSchema(rows.value)
      return false
    } catch {
      return true
    }
  })
  watch(
    invalid,
    (value) => {
      valid.value = !value
    },
    { immediate: true },
  )

  function changeMode() {
    if (invalid.value) return
    if (editorMode.value === "table") {
      json.value = JSON.stringify(rowsToSchema(rows.value), null, 2)
      editorMode.value = "json"
    } else {
      editorMode.value = "table"
    }
  }

  function updateJson(value: string) {
    json.value = value
    try {
      rows.value = schemaToRows(parseVariableSchema(value), rows.value)
      jsonInvalid.value = false
    } catch {
      jsonInvalid.value = true
    }
  }

  function addVariable() {
    expanded.value = true
    rows.value = [...rows.value, createVariableRow()]
  }
</script>

<template>
  <div class="mt-16px overflow-hidden rounded-6px border border-theme-default">
    <div class="flex flex-wrap items-center justify-between gap-8px bg-primary/5 px-12px py-8px">
      <NButton
        text
        class="font-500"
        :aria-expanded="expanded"
        aria-controls="template-variable-fields"
        @click="expanded = !expanded"
      >
        <template #icon><SvgIcon :icon="expanded ? 'carbon:chevron-down' : 'carbon:chevron-right'" /></template>
        {{ t("variables") }}<span class="ml-6px text-base-text-3">· {{ rows.length }}</span>
      </NButton>
      <div class="flex items-center gap-12px">
        <NButton text size="small" :disabled="invalid || disabled" @click="changeMode">{{
          editorMode === "table" ? t("editJson") : t("editTable")
        }}</NButton>
        <NButton
          v-if="editorMode === 'table'"
          text
          type="primary"
          size="small"
          :disabled="disabled"
          @click="addVariable"
        >
          <template #icon><SvgIcon icon="carbon:add" /></template>{{ t("addVariable") }}
        </NButton>
      </div>
    </div>
    <div v-show="expanded" id="template-variable-fields" class="p-12px">
      <template v-if="editorMode === 'table'">
        <p v-if="rows.length === 0" class="m-0 py-8px text-13px text-base-text-3">{{ t("variablesEmpty") }}</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-570px border-collapse text-left text-13px">
            <thead class="text-base-text-3">
              <tr>
                <th class="w-32% pb-8px font-400">{{ t("variableName") }}</th>
                <th class="w-22% pb-8px pl-8px font-400">{{ t("variableType") }}</th>
                <th class="w-12% pb-8px text-center font-400">{{ t("variableRequired") }}</th>
                <th class="pb-8px pr-8px font-400">{{ t("exampleValue") }}</th>
                <th class="w-28px">
                  <span class="sr-only">{{ $t("common.operate") }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="row.id">
                <td class="py-4px">
                  <NInput
                    v-model:value="row.name"
                    size="small"
                    placeholder="username"
                    :input-props="{ 'aria-label': `${t('variableName')} ${index + 1}` }"
                  />
                </td>
                <td class="py-4px pl-8px">
                  <NSelect
                    v-model:value="row.type"
                    size="small"
                    :options="typeOptions"
                    :aria-label="`${t('variableType')} ${index + 1}`"
                  />
                </td>
                <td class="py-4px text-center">
                  <NCheckbox v-model:checked="row.required" :aria-label="`${t('variableRequired')} ${index + 1}`" />
                </td>
                <td class="py-4px pr-8px">
                  <NInput
                    v-model:value="row.example"
                    size="small"
                    :placeholder="row.type === 'boolean' ? 'true / false' : t('examplePlaceholder')"
                    :input-props="{ 'aria-label': `${t('exampleValue')} ${index + 1}` }"
                  />
                </td>
                <td class="py-4px">
                  <NButton
                    quaternary
                    size="small"
                    :disabled="disabled"
                    :aria-label="`${t('removeVariable')} ${index + 1}`"
                    @click="rows.splice(index, 1)"
                    ><template #icon><SvgIcon icon="carbon:trash-can" /></template
                  ></NButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template v-else>
        <NInput
          :value="json"
          type="textarea"
          :autosize="{ minRows: 5, maxRows: 12 }"
          :status="invalid ? 'error' : undefined"
          :input-props="{ 'aria-label': t('editJson') }"
          @update:value="updateJson"
        />
        <p class="mb-0 mt-8px text-12px leading-18px text-base-text-3">{{ t("jsonHint") }}</p>
      </template>
      <p v-if="invalid" role="alert" class="mb-0 mt-8px text-12px text-error">{{ t("schemaInvalid") }}</p>
      <p class="mb-0 mt-8px text-12px leading-18px text-base-text-3">{{ t("exampleHint") }}</p>
    </div>
  </div>
</template>
