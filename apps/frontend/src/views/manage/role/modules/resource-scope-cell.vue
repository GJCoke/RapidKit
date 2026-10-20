<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"
  import {
    dataScopeOptions,
    fieldModeOptions,
    getDataScope,
    getFieldMode,
    invalidScopeKey,
    setDataScope,
    setFieldMode,
    type DataScopes,
    type FieldModeValue,
    type FieldModes,
    type ScopeResource,
  } from "./resource-scope"

  defineOptions({ name: "ResourceScopeCell" })

  interface Props {
    resource: ScopeResource
    invalidKeys?: Set<string>
    preserveDefaults?: boolean
    disabled?: boolean
  }

  const props = withDefaults(defineProps<Props>(), { invalidKeys: () => new Set<string>() })
  const dataScopes = defineModel<DataScopes>("dataScopes", { required: true })
  const fieldModes = defineModel<FieldModes>("fieldModes", { required: true })

  const modeLabels = computed<Record<FieldModeValue, string>>(() => ({
    visible: $t("page.manage.role.fieldMode.visible"),
    masked: $t("page.manage.role.fieldMode.masked"),
    hidden: $t("page.manage.role.fieldMode.hidden"),
  }))
  const scopeOptions = computed(() => dataScopeOptions(props.resource, $t("page.manage.role.dataScopeAll")))

  const selectedScope = computed({
    get: () => getDataScope(dataScopes.value, props.resource.key),
    set: (value: string) => {
      dataScopes.value = setDataScope(dataScopes.value, props.resource.key, value, props.preserveDefaults)
    },
  })

  function statusOf(group?: string) {
    return props.invalidKeys.has(invalidScopeKey(props.resource.key, group)) ? "error" : undefined
  }

  function updateMode(group: string, value: FieldModeValue) {
    fieldModes.value = setFieldMode(fieldModes.value, props.resource.key, group, value, props.preserveDefaults)
  }
</script>

<template>
  <div class="flex flex-wrap items-center gap-8px">
    <div v-if="resource.dataScopes.length" class="flex items-center gap-4px">
      <span class="text-12px text-base-text-3">{{ $t("page.manage.role.dataScope") }}</span>
      <NSelect
        v-model:value="selectedScope"
        :disabled="disabled"
        :options="scopeOptions"
        :status="statusOf()"
        :aria-label="`${resource.label} / ${$t('page.manage.role.dataScope')}`"
        size="small"
        class="w-160px"
      />
    </div>
    <div v-for="group in resource.fieldGroups" :key="group.key" class="flex items-center gap-4px">
      <span class="text-12px text-base-text-3">{{ group.label }}</span>
      <NSelect
        :value="getFieldMode(fieldModes, resource.key, group.key)"
        :disabled="disabled"
        :aria-label="`${resource.label} / ${group.label}`"
        :options="fieldModeOptions(group, modeLabels)"
        :status="statusOf(group.key)"
        size="small"
        class="w-100px"
        @update:value="(value: FieldModeValue) => updateMode(group.key, value)"
      />
    </div>
    <p
      v-if="!resource.dataScopes.length && !resource.fieldGroups.length"
      class="m-0 w-full rd-6px bg-theme-fill px-12px py-10px text-13px text-base-text-3"
    >
      {{ $t("page.manage.role.workbench.noRestrictionOptions") }}
    </p>
  </div>
</template>
