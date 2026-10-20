<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"
  import { expandImpliedCodes, toggleCode, type PermissionMatrixRow } from "./permission-matrix"
  import { matchingResourcePackage } from "./permission-draft"
  import ResourceScopeCell from "./resource-scope-cell.vue"
  import { hasScopeControls, type DataScopes, type FieldModes } from "./resource-scope"

  defineOptions({ name: "PermissionResourceEditor" })
  const props = defineProps<{
    row: PermissionMatrixRow
    catalog: Api.Permission.Catalog
    packages: Api.PermissionPackage.Package[]
    disabled: boolean
    invalidKeys: Set<string>
  }>()
  const selected = defineModel<string[]>("selected", { required: true })
  const dataScopes = defineModel<DataScopes>("dataScopes", { required: true })
  const fieldModes = defineModel<FieldModes>("fieldModes", { required: true })
  const direct = computed(() => new Set(selected.value))
  const implied = computed(() => new Set(expandImpliedCodes(selected.value, props.catalog)))
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
  <section class="min-h-0 min-w-0 flex-col gap-16px" :aria-label="row.resource.label">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-8px">
      <h3 class="m-0 text-18px font-600">{{ row.resource.label }}</h3>
      <NTag size="small" :bordered="false" :type="match ? 'primary' : 'default'">
        {{
          match
            ? $t("page.manage.role.workbench.match", { name: match.label })
            : $t("page.manage.role.workbench.custom")
        }}
      </NTag>
    </div>
    <div class="shrink-0">
      <div class="mb-14px flex flex-wrap items-center justify-between gap-10px border-b border-theme-default pb-10px">
        <h4 class="m-0 text-15px font-600 text-base-text-1">{{ $t("page.manage.role.actions") }}</h4>
      </div>
      <div
        v-if="packages.length"
        class="package-shortcuts mb-8px min-w-0 flex flex-wrap items-center gap-12px rd-6px bg-theme-fill px-10px py-8px"
        :aria-label="$t('page.manage.role.workbench.packages')"
      >
        <span class="text-12px text-base-text-3">{{ $t("page.manage.role.workbench.packages") }}</span>
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
      <p v-if="packages.length" class="package-hint mb-0 mt-0 text-12px text-base-text-3">
        {{ $t("page.manage.role.workbench.packageHint") }}
      </p>
    </div>
    <NScrollbar class="permission-operations-scrollbar min-h-0 flex-1" content-class="flex-col gap-16px pb-2px pr-18px">
      <div class="grid grid-cols-1 gap-12px sm:grid-cols-2">
        <div v-for="item in row.codes" :key="item.code" class="min-h-24px min-w-0 flex items-start gap-6px">
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
      <div v-if="crossDependencies.length" class="rd-8px bg-theme-fill p-12px">
        <div class="mb-8px text-12px text-base-text-3">{{ $t("page.manage.role.workbench.crossDependencies") }}</div>
        <div class="flex flex-wrap gap-6px">
          <NTag v-for="code in crossDependencies" :key="code" size="small" :bordered="false">{{
            labels.get(code) ?? code
          }}</NTag>
        </div>
      </div>
      <div class="border-t border-theme-default pt-16px">
        <h4 class="mb-12px mt-0 text-15px font-600 text-base-text-1">
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
      <p class="m-0 text-12px text-base-text-3">{{ $t("page.manage.role.workbench.matchHint") }}</p>
    </NScrollbar>
  </section>
</template>

<style scoped>
  @media (max-width: 640px) and (max-height: 680px) {
    .package-hint {
      display: none;
    }
  }
</style>
