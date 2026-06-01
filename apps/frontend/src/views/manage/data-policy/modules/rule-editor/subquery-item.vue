<script setup lang="ts">
  import { computed, defineAsyncComponent } from "vue"
  import { $t } from "@/locales"
  import type { SubqueryNode, ModelOption, FieldOption } from "./types"

  const ConditionGroup = defineAsyncComponent(() => import("./condition-group.vue"))

  defineOptions({ name: "SubqueryItem" })

  const props = defineProps<{
    models: ModelOption[]
    currentFields: FieldOption[]
    depth?: number
    ancestorModels?: string[]
  }>()

  const model = defineModel<SubqueryNode>({ required: true })
  const emit = defineEmits<{ remove: [] }>()

  const targetFields = computed(() => {
    const m = props.models.find((m) => m.name === model.value.model)
    return m?.fields ?? []
  })

  const availableModels = computed(() => {
    const ancestors = props.ancestorModels ?? []
    return props.models.filter((m) => !ancestors.includes(m.name))
  })
</script>

<template>
  <div class="rd-8px border border-dashed border-[var(--primary-color)] p-12px bg-[var(--n-color-modal)]">
    <div class="flex items-center gap-8px mb-8px">
      <span class="text-12px text-[var(--text-color-3)]"
        >{{ $t("page.manage.dataPolicy.ruleEditor.addSubquery") }}:</span
      >
      <NSelect
        v-model:value="model.field"
        :options="currentFields.map((f) => ({ label: f.label || f.name, value: f.name }))"
        :placeholder="$t('page.manage.dataPolicy.ruleEditor.field')"
        class="w-130px"
        size="small"
        filterable
      />
      <NSelect
        v-model:value="model.operator"
        :options="[
          { label: $t('page.manage.dataPolicy.ruleEditor.inOp'), value: 'in' },
          { label: $t('page.manage.dataPolicy.ruleEditor.notInOp'), value: 'not_in' },
        ]"
        class="w-100px"
        size="small"
      />
      <NSelect
        v-model:value="model.model"
        :options="availableModels.map((m) => ({ label: m.label, value: m.name }))"
        :placeholder="$t('page.manage.dataPolicy.ruleEditor.model')"
        class="w-150px"
        size="small"
        filterable
      />
      <span class="text-12px text-[var(--text-color-3)]">.</span>
      <NSelect
        v-model:value="model.target_field"
        :options="targetFields.map((f) => ({ label: f.label || f.name, value: f.name }))"
        :placeholder="$t('page.manage.dataPolicy.ruleEditor.targetField')"
        class="w-120px"
        size="small"
        filterable
      />
      <NButton quaternary size="small" type="error" @click="emit('remove')">
        <template #icon>
          <SvgIcon icon="carbon:close" />
        </template>
      </NButton>
    </div>
    <ConditionGroup
      v-model="model.filter"
      :models="models"
      :current-model="model.model"
      :depth="(depth ?? 0) + 1"
      :ancestor-models="[...(ancestorModels ?? []), model.model].filter(Boolean)"
    />
  </div>
</template>
