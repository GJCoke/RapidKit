<script setup lang="ts">
  import { computed, nextTick } from "vue"
  import { $t } from "@/locales"
  import { policyOperatorOptions } from "@/constants/business"
  import { translateOptions } from "@/utils/common"
  import type { ConditionNode, FieldOption } from "./types"

  defineOptions({ name: "ConditionItem" })

  const props = defineProps<{
    fields: FieldOption[]
    templateVarOptions?: { label: string; value: string }[]
  }>()

  const model = defineModel<ConditionNode>({ required: true })
  const emit = defineEmits<{ remove: [] }>()

  const noValueOperators = ["is_null", "is_not_null"]
  const showValue = computed(() => !noValueOperators.includes(model.value.operator))

  // Smart operator filtering based on field type
  const operatorsByType: Record<string, string[]> = {
    string: ["eq", "ne", "in", "not_in", "is_null", "is_not_null"],
    boolean: ["eq", "ne"],
    number: ["eq", "ne", "gt", "ge", "lt", "le", "between", "is_null", "is_not_null"],
    decimal: ["eq", "ne", "gt", "ge", "lt", "le", "between", "is_null", "is_not_null"],
    integer: ["eq", "ne", "gt", "ge", "lt", "le", "between", "is_null", "is_not_null"],
    date: ["eq", "ne", "gt", "ge", "lt", "le", "between", "is_null", "is_not_null"],
    datetime: ["eq", "ne", "gt", "ge", "lt", "le", "between", "is_null", "is_not_null"],
  }

  const selectedFieldType = computed(() => {
    const field = props.fields.find((f) => f.name === model.value.field)
    return field?.type ?? ""
  })

  const operatorOpts = computed(() => {
    const allOpts = translateOptions(policyOperatorOptions)
    const allowed = operatorsByType[selectedFieldType.value]
    if (!allowed) return allOpts
    return allOpts.filter((opt) => allowed.includes(opt.value as string))
  })

  // Validation: incomplete condition
  const isIncomplete = computed(() => {
    if (!model.value.field) return true
    if (showValue.value && !model.value.value) return true
    return false
  })

  const tplVarOptions = computed(() => props.templateVarOptions ?? [])

  function handleTplSelect(value: string) {
    nextTick(() => {
      model.value.value = value
    })
  }
</script>

<template>
  <div
    class="flex items-center gap-8px px-10px py-6px rd-6px transition-colors hover:bg-[var(--n-color-modal)]"
    :class="
      isIncomplete
        ? 'border border-dashed border-[var(--error-color)] bg-[rgba(239,71,111,0.04)]'
        : 'bg-[var(--body-color)]'
    "
  >
    <icon-carbon-warning-alt v-if="isIncomplete" class="text-14px text-[var(--error-color)] shrink-0 op-60" />
    <NSelect
      v-model:value="model.field"
      :options="fields.map((f) => ({ label: f.label || f.name, value: f.name }))"
      :placeholder="$t('page.manage.dataPolicy.ruleEditor.field')"
      class="w-150px"
      size="small"
      filterable
    />
    <NSelect
      v-model:value="model.operator"
      :options="operatorOpts"
      :placeholder="$t('page.manage.dataPolicy.ruleEditor.operator')"
      class="w-120px"
      size="small"
    />
    <NAutoComplete
      v-if="showValue"
      v-model:value="model.value as string"
      :options="tplVarOptions"
      :placeholder="$t('page.manage.dataPolicy.ruleEditor.value')"
      class="flex-1"
      size="small"
      @select="handleTplSelect"
    />
    <NButton quaternary size="small" type="error" @click="emit('remove')">
      <template #icon>
        <SvgIcon icon="carbon:close" />
      </template>
    </NButton>
  </div>
</template>
