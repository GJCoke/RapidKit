<script setup lang="ts">
  import { computed, onMounted, ref } from "vue"
  import { $t } from "@/locales"
  import { fetchGetTemplateVars } from "@/service/api/system-manage"
  import type { GroupNode, ConditionNode, SubqueryNode, ModelOption } from "./types"
  import ConditionItem from "./condition-item.vue"
  import SubqueryItem from "./subquery-item.vue"

  defineOptions({ name: "ConditionGroup" })

  const props = defineProps<{
    models: ModelOption[]
    currentModel: string
    depth?: number
    removable?: boolean
    ancestorModels?: string[]
    templateVarOptions?: { label: string; value: string }[]
  }>()

  const model = defineModel<GroupNode>({ required: true })
  const emit = defineEmits<{ remove: [] }>()

  const maxDepth = 3
  const canNest = computed(() => (props.depth ?? 0) < maxDepth)

  const collapsed = ref(false)

  const depthHues = [220, 170, 45, 0, 270, 140]
  const bandColor = computed(() => {
    const hue = depthHues[Math.min(props.depth ?? 0, depthHues.length - 1)]
    return `hsl(${hue}, 65%, 55%)`
  })

  const currentFields = computed(() => {
    const m = props.models.find((m) => m.name === props.currentModel)
    return m?.fields ?? []
  })

  const tplVarOptions = ref<{ label: string; value: string }[]>([])

  onMounted(async () => {
    if (props.depth || props.templateVarOptions) return
    const { data } = await fetchGetTemplateVars()
    if (data) {
      tplVarOptions.value = data.map((v) => ({
        label: `${v.description} \${${v.name}}`,
        value: `\${${v.name}}`,
      }))
    }
  })

  const resolvedTplVarOptions = computed(() => props.templateVarOptions ?? tplVarOptions.value)

  function addCondition() {
    model.value.conditions.push({
      type: "condition",
      field: "",
      operator: "eq",
      value: "",
    })
  }

  function addGroup() {
    model.value.conditions.push({
      type: "group",
      logic: "AND",
      conditions: [{ type: "condition", field: "", operator: "eq", value: "" }],
    })
  }

  function addSubquery() {
    model.value.conditions.push({
      type: "subquery",
      field: "",
      operator: "in",
      model: "",
      target_field: "id",
      filter: { type: "group", logic: "AND", conditions: [] },
    })
  }

  function removeCondition(index: number) {
    model.value.conditions.splice(index, 1)
  }
</script>

<template>
  <div
    class="rd-8px p-12px"
    :class="depth ? 'bg-[var(--n-color-modal)]' : ''"
    :style="{ border: `1px solid ${bandColor}` }"
  >
    <!-- Group header -->
    <div class="flex items-center gap-8px mb-8px">
      <NButton quaternary size="tiny" class="w-20px h-20px" @click="collapsed = !collapsed">
        <template #icon>
          <SvgIcon :icon="collapsed ? 'carbon:chevron-right' : 'carbon:chevron-down'" class="text-12px" />
        </template>
      </NButton>

      <NTag
        size="tiny"
        :bordered="false"
        round
        :color="{ color: `${bandColor}22`, textColor: bandColor }"
        class="font-700"
      >
        L{{ (depth ?? 0) + 1 }}
      </NTag>

      <NButtonGroup size="tiny">
        <NButton :type="model.logic === 'AND' ? 'primary' : 'default'" @click="model.logic = 'AND'"> AND </NButton>
        <NButton :type="model.logic === 'OR' ? 'primary' : 'default'" @click="model.logic = 'OR'"> OR </NButton>
      </NButtonGroup>

      <span v-if="collapsed" class="text-12px text-[var(--text-color-3)]">
        ({{ model.conditions.length }} {{ $t("page.manage.dataPolicy.ruleEditor.conditionCount") }})
      </span>

      <div class="flex items-center gap-4px ml-auto">
        <NButton size="tiny" dashed @click="addCondition">
          + {{ $t("page.manage.dataPolicy.ruleEditor.addCondition") }}
        </NButton>
        <NButton v-if="canNest" size="tiny" dashed @click="addGroup">
          + {{ $t("page.manage.dataPolicy.ruleEditor.addGroup") }}
        </NButton>
        <NButton v-if="canNest" size="tiny" dashed @click="addSubquery">
          + {{ $t("page.manage.dataPolicy.ruleEditor.addSubquery") }}
        </NButton>
        <NButton v-if="removable" quaternary size="tiny" type="error" @click="emit('remove')">
          <template #icon>
            <SvgIcon icon="carbon:close" />
          </template>
        </NButton>
      </div>
    </div>

    <!-- Collapsible children -->
    <div v-show="!collapsed">
      <!-- Empty state -->
      <div
        v-if="!model.conditions.length"
        class="flex-center gap-8px py-24px rd-6px border border-dashed border-[var(--border-color)] cursor-pointer text-[var(--text-color-3)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-colors"
        @click="addCondition"
      >
        <icon-carbon-add-alt class="text-18px" />
        <span class="text-12px">{{ $t("page.manage.dataPolicy.ruleEditor.emptyHint") }}</span>
      </div>

      <!-- Condition list -->
      <div v-else class="flex flex-col gap-8px">
        <template v-for="(condition, index) in model.conditions" :key="index">
          <ConditionGroup
            v-if="condition.type === 'group'"
            v-model="model.conditions[index] as GroupNode"
            :models="models"
            :current-model="currentModel"
            :depth="(depth ?? 0) + 1"
            removable
            :template-var-options="resolvedTplVarOptions"
            @remove="removeCondition(index)"
          />
          <SubqueryItem
            v-else-if="condition.type === 'subquery'"
            v-model="model.conditions[index] as SubqueryNode"
            :models="models"
            :current-fields="currentFields"
            :depth="depth"
            :ancestor-models="[...(ancestorModels ?? []), currentModel].filter(Boolean)"
            @remove="removeCondition(index)"
          />
          <ConditionItem
            v-else
            v-model="model.conditions[index] as ConditionNode"
            :fields="currentFields"
            :template-var-options="resolvedTplVarOptions"
            @remove="removeCondition(index)"
          />
        </template>
      </div>
    </div>
  </div>
</template>
