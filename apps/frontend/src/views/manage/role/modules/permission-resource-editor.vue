<script setup lang="ts">
  import { computed } from "vue"
  import { NScrollbar } from "naive-ui"
  import { $t } from "@/locales"
  import { expandImpliedCodes, toggleCode, type PermissionMatrixRow } from "./permission-matrix"
  import { applyPermissionSelection, matchingResourcePackage } from "./permission-draft"
  import ResourceScopeCell from "./resource-scope-cell.vue"
  import { hasScopeControls, type DataScopes, type FieldModes } from "./resource-scope"

  defineOptions({ name: "PermissionResourceEditor" })
  const props = defineProps<{
    row: PermissionMatrixRow
    catalog: Api.Permission.Catalog
    packages: Api.PermissionPackage.Package[]
    disabled: boolean
    invalidKeys: Set<string>
    embedded?: boolean
    query?: string
  }>()
  const selected = defineModel<string[]>("selected", { required: true })
  const dataScopes = defineModel<DataScopes>("dataScopes", { required: true })
  const fieldModes = defineModel<FieldModes>("fieldModes", { required: true })
  const direct = computed(() => new Set(selected.value))
  const visibleCodes = computed(() =>
    props.row.codes.filter((c) =>
      `${c.label} ${c.code}`.toLocaleLowerCase().includes(props.query?.trim().toLocaleLowerCase() ?? ""),
    ),
  )
  const implied = computed(() => new Set(expandImpliedCodes(selected.value, props.catalog)))
  function effectiveHas(code: string) {
    return direct.value.has(code) || implied.value.has(code)
  }
  const labels = computed(() => new Map(props.catalog.codes.map((c) => [c.code, c.label])))
  const match = computed(() => matchingResourcePackage(selected.value, props.row.resource.key, props.packages))
  const hasOperations = computed(() =>
    props.row.codes.some((c) => direct.value.has(c.code) || implied.value.has(c.code)),
  )
  const crossDependencies = computed(() =>
    expandImpliedCodes(
      selected.value.filter((c) => props.row.codes.some((item) => item.code === c)),
      props.catalog,
    ).filter((c) => !c.startsWith(`${props.row.resource.key}:`)),
  )
  function togglePackage(item: Api.PermissionPackage.Package, checked: boolean) {
    const codes = new Set(item.codes)
    selected.value = checked
      ? [...new Set([...selected.value, ...codes])]
      : selected.value.filter((code) => !codes.has(code))
  }
  function dependencySources(code: string) {
    return selected.value
      .filter((c) => expandImpliedCodes([c], props.catalog).includes(code))
      .map((c) => labels.value.get(c) ?? c)
      .join("、")
  }
</script>

<template>
  <section class="min-h-0 min-w-0 flex-col gap-12px" :aria-label="row.resource.label">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-8px">
      <NCheckbox
        v-if="embedded"
        :aria-label="`${row.resource.label} / ${$t('page.manage.role.workbench.resourceAll')}`"
        :checked="row.codes.every((c) => effectiveHas(c.code))"
        :indeterminate="row.codes.some((c) => effectiveHas(c.code)) && !row.codes.every((c) => effectiveHas(c.code))"
        :disabled="disabled"
        @update:checked="
          (checked) => (selected = applyPermissionSelection(selected, row.codes, checked ? 'all' : 'clear'))
        "
      >
        {{ $t("page.manage.role.workbench.resourceAll") }}
      </NCheckbox>
      <h3 v-else class="m-0 text-18px font-600">{{ row.resource.label }}</h3>
      <NTag v-if="!embedded || packages.length" size="small" :bordered="false" :type="match ? 'primary' : 'default'">
        {{
          match
            ? $t("page.manage.role.workbench.match", { name: match.label })
            : $t("page.manage.role.workbench.custom")
        }}
      </NTag>
    </div>
    <div v-if="!embedded || packages.length" class="shrink-0">
      <div
        v-if="!embedded"
        class="mb-14px flex flex-wrap items-center justify-between gap-10px border-b border-theme-default pb-10px"
      >
        <h4 class="m-0 text-15px font-600 text-base-text-1">{{ $t("page.manage.role.actions") }}</h4>
      </div>
      <div
        v-if="packages.length"
        class="package-shortcuts min-w-0 flex flex-wrap items-center gap-12px"
        :aria-label="$t('page.manage.role.workbench.packages')"
      >
        <span class="flex items-center gap-4px text-12px text-base-text-3">
          {{ $t("page.manage.role.workbench.packages") }}
          <NPopover trigger="click" placement="bottom-start">
            <template #trigger>
              <NButton quaternary circle size="tiny" :aria-label="$t('page.manage.role.workbench.packageHint')">
                <SvgIcon icon="carbon:information" class="text-14px text-base-text-3" />
              </NButton>
            </template>
            <div class="max-w-320px flex-col gap-8px text-12px">
              <p class="m-0">{{ $t("page.manage.role.workbench.packageHint") }}</p>
              <p class="m-0">{{ $t("page.manage.role.workbench.matchHint") }}</p>
            </div>
          </NPopover>
        </span>
        <NCheckbox
          v-for="item in packages"
          :key="item.key"
          :aria-label="item.label"
          :checked="item.codes.every((code) => direct.has(code))"
          :indeterminate="item.codes.some((code) => direct.has(code)) && !item.codes.every((code) => direct.has(code))"
          :disabled="disabled"
          @update:checked="(checked) => togglePackage(item, checked)"
          >{{ item.label }}</NCheckbox
        >
      </div>
    </div>
    <component
      :is="embedded ? 'div' : NScrollbar"
      class="permission-operations-scrollbar min-h-0 flex-1 flex-col gap-12px"
      :content-class="embedded ? undefined : 'flex-col gap-12px pb-2px pr-18px'"
    >
      <h4 v-if="embedded" class="m-0 text-13px font-500 text-base-text-2">
        {{ $t("page.manage.role.actions") }}
      </h4>
      <div class="grid grid-cols-1 gap-12px sm:grid-cols-2" :class="{ 'lg:grid-cols-4': embedded }">
        <div v-for="item in visibleCodes" :key="item.code" class="min-h-24px min-w-0 flex items-start gap-6px">
          <NCheckbox
            :checked="direct.has(item.code) || implied.has(item.code)"
            :disabled="disabled || (!direct.has(item.code) && implied.has(item.code))"
            @update:checked="(checked) => (selected = toggleCode(selected, item.code, checked))"
          >
            {{ item.label }}
          </NCheckbox>
          <NPopover v-if="!direct.has(item.code) && implied.has(item.code)" trigger="click" placement="bottom-start">
            <template #trigger>
              <NButton
                text
                class="shrink-0"
                :aria-label="$t('page.manage.role.workbench.dependencyDetails', { name: item.label })"
              >
                <NTag size="small" :bordered="false">{{ $t("page.manage.role.implied") }}</NTag>
              </NButton>
            </template>
            <div class="max-w-280px text-12px">
              {{ $t("page.manage.role.workbench.requiredBy", { names: dependencySources(item.code) }) }}
            </div>
          </NPopover>
        </div>
      </div>
      <div v-if="!embedded && crossDependencies.length" class="rd-8px bg-theme-fill p-12px">
        <div class="mb-8px text-12px text-base-text-3">{{ $t("page.manage.role.workbench.crossDependencies") }}</div>
        <div class="flex flex-wrap gap-6px">
          <NTag v-for="code in crossDependencies" :key="code" size="small" :bordered="false">{{
            labels.get(code) ?? code
          }}</NTag>
        </div>
      </div>
      <div v-if="!embedded || hasScopeControls(row.resource)" class="rd-6px bg-theme-fill p-12px">
        <h4 class="mb-10px mt-0 text-13px font-500 text-base-text-2">
          {{ $t("page.manage.role.workbench.restrictions") }}
        </h4>
        <p v-if="!hasOperations && hasScopeControls(row.resource)" class="mt-0 text-12px text-base-text-3">
          {{ $t("page.manage.role.workbench.inactiveRestrictions") }}
        </p>
        <ResourceScopeCell
          v-model:data-scopes="dataScopes"
          v-model:field-modes="fieldModes"
          :resource="row.resource"
          :invalid-keys="invalidKeys"
          :disabled="disabled || !hasOperations"
        />
      </div>
    </component>
  </section>
</template>
