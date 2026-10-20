<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"
  import type { PermissionDraftDiff } from "./permission-draft"
  import type { InvalidScope } from "./resource-scope"

  defineOptions({ name: "PermissionChangeReview" })
  const props = defineProps<{
    diff: PermissionDraftDiff
    catalog: Api.Permission.Catalog
    repairs?: InvalidScope[]
  }>()
  const codeLabels = computed(() => new Map(props.catalog.codes.map((c) => [c.code, c.label])))
  const groups = computed(() => [
    {
      key: "addedCodes",
      title: $t("page.manage.role.workbench.addedCodes"),
      codes: props.diff.addedCodes,
      type: "success" as const,
    },
    {
      key: "removedCodes",
      title: $t("page.manage.role.workbench.removedCodes"),
      codes: props.diff.removedCodes,
      type: "error" as const,
    },
    {
      key: "addedImplied",
      title: $t("page.manage.role.workbench.addedImplied"),
      codes: props.diff.addedImplied,
      type: "info" as const,
    },
    {
      key: "removedImplied",
      title: $t("page.manage.role.workbench.removedImplied"),
      codes: props.diff.removedImplied,
      type: "warning" as const,
    },
  ])
  function scopeLabel(resourceKey: string, groupKey: string | null, value: string) {
    const resource = props.catalog.resources.find((r) => r.key === resourceKey)
    if (groupKey) {
      const modes = {
        visible: $t("page.manage.role.fieldMode.visible"),
        masked: $t("page.manage.role.fieldMode.masked"),
        hidden: $t("page.manage.role.fieldMode.hidden"),
      }
      return modes[value as keyof typeof modes] ?? value
    }
    return value === "all"
      ? $t("page.manage.role.dataScopeAll")
      : (resource?.dataScopes.find((s) => s.key === value)?.label ?? value)
  }
  function targetLabel(resourceKey: string, groupKey?: string | null) {
    const resource = props.catalog.resources.find((r) => r.key === resourceKey)
    return [
      resource?.label ?? resourceKey,
      groupKey ? (resource?.fieldGroups.find((g) => g.key === groupKey)?.label ?? groupKey) : "",
    ]
      .filter(Boolean)
      .join(" / ")
  }
</script>

<template>
  <div class="flex-col gap-16px" aria-live="polite">
    <div v-for="group in groups" :key="group.key" class="flex-col gap-8px">
      <div class="font-500">
        {{ group.title }} <span class="tabular-nums text-base-text-3">{{ group.codes.length }}</span>
      </div>
      <div v-if="group.codes.length" class="flex flex-wrap gap-6px">
        <NTag v-for="code in group.codes" :key="code" :type="group.type" size="small" :bordered="false">
          {{ codeLabels.get(code) ?? code }}
        </NTag>
      </div>
      <span v-else class="text-12px text-base-text-3">{{ $t("page.manage.role.workbench.noChanges") }}</span>
    </div>
    <div class="border-t border-theme-default pt-12px">
      <div class="mb-8px font-500">{{ $t("page.manage.role.workbench.restrictions") }}</div>
      <div v-for="change in diff.scopeChanges" :key="`${change.resource}.${change.group}`" class="mb-6px break-words">
        {{ targetLabel(change.resource, change.group) }}：{{
          scopeLabel(change.resource, change.group, change.before)
        }}
        → {{ scopeLabel(change.resource, change.group, change.after) }}
      </div>
      <span v-if="!diff.scopeChanges.length" class="text-12px text-base-text-3">{{
        $t("page.manage.role.workbench.keepRestrictions")
      }}</span>
    </div>
    <NAlert v-if="repairs?.length" type="warning" :title="$t('page.manage.role.workbench.repairSummary')">
      <div v-for="item in repairs" :key="`${item.resource}.${item.group}`">
        {{ targetLabel(item.resource, item.group) }}：{{ item.stored }} → {{ item.effective }}
      </div>
    </NAlert>
    <NText depth="3" class="text-12px">{{ $t("page.manage.role.workbench.oneTimeHint") }}</NText>
  </div>
</template>
