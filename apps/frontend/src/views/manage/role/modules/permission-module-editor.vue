<script setup lang="ts">
  import { computed, ref } from "vue"
  import { $t } from "@/locales"
  import { applyPermissionSelection, packagesForResource } from "./permission-draft"
  import { expandImpliedCodes } from "./permission-matrix"
  import type { PermissionModule, PermissionModuleEntry } from "./permission-menu-groups"
  import type { DataScopes, FieldModes } from "./resource-scope"
  import PermissionResourceEditor from "./permission-resource-editor.vue"

  defineOptions({ name: "PermissionModuleEditor" })
  const props = defineProps<{
    module: PermissionModule
    catalog: Api.Permission.Catalog
    packages: Api.PermissionPackage.Package[]
    disabled: boolean
    invalidKeys: Set<string>
    query: string
  }>()
  const emit = defineEmits<{ "focus-resource": [resourceKey: string] }>()
  const selected = defineModel<string[]>("selected", { required: true })
  const dataScopes = defineModel<DataScopes>("dataScopes", { required: true })
  const fieldModes = defineModel<FieldModes>("fieldModes", { required: true })
  const bulkMode = ref<"all" | "readonly" | "clear" | null>(null)
  const owned = computed(() => props.module.entries.filter((e) => e.ownerKey === props.module.key))
  const codes = computed(() => owned.value.flatMap((e) => e.row.codes))
  const implied = computed(() => new Set(expandImpliedCodes(selected.value, props.catalog)))
  const effective = computed(() => new Set([...selected.value, ...implied.value]))
  const count = computed(() => codes.value.filter((c) => effective.value.has(c.code)).length)
  const residual = computed(() =>
    codes.value.some(
      (c) =>
        implied.value.has(c.code) &&
        (bulkMode.value === "clear" || (bulkMode.value === "readonly" && c.abacAction !== "read")),
    ),
  )
  const byCode = computed(() => new Map(props.catalog.codes.map((c) => [c.code, c])))
  const dependencies = computed(() => {
    const targets = new Set(codes.value.map((c) => c.code))
    return expandImpliedCodes(
      selected.value.filter((c) => targets.has(c)),
      props.catalog,
    ).filter((c) => !targets.has(c))
  })
  function sources(code: string) {
    return selected.value
      .filter((c) => expandImpliedCodes([c], props.catalog).includes(code))
      .map((c) => byCode.value.get(c)?.label ?? c)
      .join("、")
  }
  function apply(mode: "all" | "readonly" | "clear") {
    selected.value = applyPermissionSelection(selected.value, codes.value, mode)
    bulkMode.value = mode
  }
  function entryQuery(entry: PermissionModuleEntry) {
    const query = props.query.trim().toLocaleLowerCase()
    return [props.module.label, entry.row.resource.label, ...entry.path].some((label) =>
      label.toLocaleLowerCase().includes(query),
    )
      ? ""
      : query
  }
  const visibleEntries = computed(() =>
    props.module.entries.filter((entry) => {
      const query = entryQuery(entry)
      return !query || entry.row.codes.some((c) => `${c.label} ${c.code}`.toLocaleLowerCase().includes(query))
    }),
  )
</script>

<template>
  <section
    class="permission-module-editor min-h-0 min-w-0 flex-1 flex-col gap-12px"
    :aria-label="module.label"
    :data-permission-module="module.key"
  >
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-8px">
      <h3 class="m-0 text-18px font-600">{{ module.label }}</h3>
      <NTag size="small" :bordered="false">{{ count }}/{{ codes.length }}</NTag>
    </div>
    <div v-if="codes.length" class="shrink-0 flex-col gap-8px">
      <div class="flex flex-wrap gap-8px">
        <NButton size="small" :disabled="disabled" @click="apply('readonly')">{{
          $t("page.manage.role.workbench.moduleReadonly")
        }}</NButton>
        <NButton size="small" :disabled="disabled" @click="apply('all')">{{
          $t("page.manage.role.workbench.moduleAll")
        }}</NButton>
        <NButton size="small" :disabled="disabled" @click="apply('clear')">{{
          $t("page.manage.role.workbench.moduleClear")
        }}</NButton>
      </div>
      <p class="m-0 text-12px text-base-text-3">
        {{ $t("page.manage.role.workbench.moduleBulkHint", { count: codes.length }) }}
      </p>
      <NAlert v-if="residual" type="warning" :bordered="false">{{
        $t("page.manage.role.workbench.dependencyStillEffective")
      }}</NAlert>
    </div>
    <NScrollbar class="min-h-0 flex-1" content-class="flex-col gap-16px pr-18px pb-4px">
      <NCollapse :default-expanded-names="module.entries.map((e) => e.row.resource.key)">
        <NCollapseItem
          v-for="entry in visibleEntries"
          :key="entry.row.resource.key"
          :name="entry.row.resource.key"
          :title="entry.row.resource.label"
        >
          <template #header="{ collapsed }">
            <button
              type="button"
              class="cursor-pointer border-0 bg-transparent p-0 text-left text-inherit focus-visible:outline-theme-primary"
              :aria-expanded="!collapsed"
            >
              {{ entry.row.resource.label }}
            </button>
          </template>
          <p v-if="entry.path.length" class="mb-12px mt-0 text-12px text-base-text-3">{{ entry.path.join(" / ") }}</p>
          <NButton
            v-if="entry.ownerKey !== module.key"
            :disabled="disabled"
            :data-shared-resource="entry.row.resource.key"
            @click="emit('focus-resource', entry.row.resource.key)"
          >
            {{ $t("page.manage.role.workbench.sharedResource", { name: entry.row.resource.label }) }}
          </NButton>
          <PermissionResourceEditor
            v-else
            :data-resource-key="entry.row.resource.key"
            embedded
            v-model:selected="selected"
            v-model:data-scopes="dataScopes"
            v-model:field-modes="fieldModes"
            :row="entry.row"
            :catalog="catalog"
            :packages="packagesForResource(packages, entry.row.resource.key)"
            :disabled="disabled"
            :invalid-keys="invalidKeys"
            :query="entryQuery(entry)"
          />
        </NCollapseItem>
      </NCollapse>
      <NEmpty v-if="!visibleEntries.length" :description="$t('page.manage.role.workbench.searchEmpty')" />
      <div v-if="dependencies.length" class="rd-8px bg-theme-fill p-12px">
        <h4 class="mb-8px mt-0 text-13px font-500">{{ $t("page.manage.role.workbench.crossDependencies") }}</h4>
        <div class="flex-col gap-8px">
          <div v-for="code in dependencies" :key="code" class="flex flex-wrap items-center gap-8px text-12px">
            <NButton
              text
              size="small"
              :disabled="disabled"
              :data-dependency-resource="byCode.get(code)?.resource"
              @click="emit('focus-resource', byCode.get(code)!.resource)"
            >
              {{ byCode.get(code)?.label ?? code }}
            </NButton>
            <span class="text-base-text-3">{{
              $t("page.manage.role.workbench.requiredBy", { names: sources(code) })
            }}</span>
          </div>
        </div>
        <p v-if="dependencies.includes('department:read')" class="mb-0 mt-8px text-12px text-warning">
          {{ $t("page.manage.role.workbench.dependencyPageAccess") }}
        </p>
      </div>
    </NScrollbar>
  </section>
</template>
