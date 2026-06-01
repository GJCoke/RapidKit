<script setup lang="ts">
  import { ref } from "vue"
  import { $t } from "@/locales"
  import type { GroupNode, ModelOption } from "./types"
  import ConditionGroup from "./condition-group.vue"

  defineOptions({ name: "RuleEditor" })

  defineProps<{
    models: ModelOption[]
  }>()

  const model = defineModel<GroupNode>({ required: true })
  const selectedModel = defineModel<string>("currentModel", { default: "" })
  const showHelp = ref(false)
</script>

<template>
  <div class="w-full flex-col-stretch gap-12px">
    <div class="flex items-center gap-8px">
      <NSelect
        v-model:value="selectedModel"
        :options="models.map((m) => ({ label: m.label, value: m.name }))"
        :placeholder="$t('page.manage.dataPolicy.ruleEditor.selectModel')"
        filterable
        clearable
        class="flex-1"
      />
      <NButton quaternary size="small" class="shrink-0" @click="showHelp = true">
        <template #icon>
          <icon-carbon-help class="text-16px" />
        </template>
      </NButton>
      <NModal
        v-model:show="showHelp"
        preset="card"
        :title="$t('page.manage.dataPolicy.ruleEditor.help.title')"
        class="w-480px"
      >
        <div class="text-13px leading-relaxed flex-col-stretch gap-16px">
          <div>
            <div class="font-600 text-primary mb-4px">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.conditionTitle") }}
            </div>
            <p class="text-[var(--text-color-3)] mb-4px">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.conditionDesc") }}
            </p>
            <pre class="text-11px px-10px py-8px rd-6px bg-[var(--body-color)] overflow-x-auto">
status = "active"
level > 5
region = ${user.region}</pre
            >
          </div>

          <div>
            <div class="font-600 text-success mb-4px">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.groupTitle") }}
            </div>
            <p class="text-[var(--text-color-3)] mb-4px">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.groupDesc") }}
            </p>
            <pre class="text-11px px-10px py-8px rd-6px bg-[var(--body-color)] overflow-x-auto">
AND
├── status = "active"
└── OR
    ├── role = "manager"
    └── level > 5</pre
            >
          </div>

          <div>
            <div class="font-600 text-warning mb-4px">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.subqueryTitle") }}
            </div>
            <p class="text-[var(--text-color-3)] mb-4px">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.subqueryDesc") }}
            </p>
            <pre class="text-11px px-10px py-8px rd-6px bg-[var(--body-color)] overflow-x-auto">
department_id IN
  (SELECT id FROM departments
   WHERE org_id = ${user.org_id})</pre
            >
          </div>

          <div>
            <div class="font-600 mb-4px">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.tplVarTitle") }}
            </div>
            <p class="text-[var(--text-color-3)]">
              {{ $t("page.manage.dataPolicy.ruleEditor.help.tplVarDesc") }}
            </p>
          </div>
        </div>
      </NModal>
    </div>
    <ConditionGroup v-model="model" :models="models" :current-model="selectedModel" :depth="0" />
  </div>
</template>
