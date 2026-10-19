<script setup lang="tsx">
  import { computed, ref, shallowRef, watch } from "vue"
  import type { DataTableColumns } from "naive-ui"
  import { NCheckbox, NSpace, NTag } from "naive-ui"
  import { jsonClone } from "@rapidkit/utils"
  import { useOperationAccess } from "@/hooks/business/table-actions/use-operation-access"
  import { fetchGetPermissionCatalog, fetchGetRolePermissions, fetchUpdateRolePermissions } from "@/service/api"
  import { $t } from "@/locales"
  import {
    buildPermissionRows,
    expandImpliedCodes,
    splitKnownCodes,
    toggleCode,
    type PermissionMatrixRow,
  } from "./permission-matrix"
  import ResourceScopeCell from "./resource-scope-cell.vue"
  import {
    invalidScopeKey,
    invalidScopeKeys,
    type DataScopes,
    type FieldModes,
    type InvalidScope,
  } from "./resource-scope"

  defineOptions({
    name: "PermissionModal",
  })

  interface Props {
    roleId: string
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "saved"): void
  }

  const emit = defineEmits<Emits>()

  const visible = defineModel<boolean>("visible", {
    default: false,
  })
  const operationAccess = useOperationAccess(() => "role:grant", visible)

  const loading = ref(false)
  const loaded = ref(false)
  const saving = ref(false)
  const catalog = shallowRef<Api.Permission.Catalog | null>(null)
  const selected = ref<string[]>([])
  const invalidCodes = ref<string[]>([])
  const dataScopes = ref<DataScopes>({})
  const fieldModes = ref<FieldModes>({})
  const invalidScopes = ref<InvalidScope[]>([])
  const invalidKeys = computed(() => invalidScopeKeys(invalidScopes.value))

  const rows = computed(() => (catalog.value ? buildPermissionRows(catalog.value) : []))
  const selectedSet = computed(() => new Set(selected.value))
  const impliedSet = computed(() => new Set(catalog.value ? expandImpliedCodes(selected.value, catalog.value) : []))

  function rowKey(row: PermissionMatrixRow) {
    return row.resource.key
  }

  function renderCode(item: Api.Permission.CatalogCode) {
    const isSelected = selectedSet.value.has(item.code)
    const isImplied = !isSelected && impliedSet.value.has(item.code)

    return (
      <NCheckbox
        checked={isSelected || isImplied}
        disabled={isImplied}
        onUpdateChecked={(checked: boolean) => {
          selected.value = toggleCode(selected.value, item.code, checked)
        }}
      >
        {item.label}
        {isImplied && (
          <NTag size="small" bordered={false} class="ml-4px">
            {$t("page.manage.role.implied")}
          </NTag>
        )}
      </NCheckbox>
    )
  }

  const columns = computed<DataTableColumns<PermissionMatrixRow>>(() => [
    {
      key: "resource",
      title: $t("page.manage.role.resource"),
      width: 160,
      render: (row) => row.resource.label,
    },
    {
      key: "actions",
      title: $t("page.manage.role.actions"),
      render: (row) => <NSpace size={[16, 8]}>{row.codes.map(renderCode)}</NSpace>,
    },
    {
      key: "scope",
      title: $t("page.manage.role.scope"),
      width: 360,
      render: (row) => (
        <ResourceScopeCell
          resource={row.resource}
          invalidKeys={invalidKeys.value}
          dataScopes={dataScopes.value}
          fieldModes={fieldModes.value}
          onUpdate:dataScopes={(next: DataScopes) => (dataScopes.value = next)}
          onUpdate:fieldModes={(next: FieldModes) => (fieldModes.value = next)}
        />
      ),
    },
  ])

  function closeModal() {
    visible.value = false
  }

  async function loadData() {
    loading.value = true
    loaded.value = false
    selected.value = []
    invalidCodes.value = []
    dataScopes.value = {}
    fieldModes.value = {}
    invalidScopes.value = []
    try {
      const [catalogRes, permissionRes] = await Promise.all([
        fetchGetPermissionCatalog(),
        fetchGetRolePermissions(props.roleId),
      ])
      if (catalogRes.error || permissionRes.error) return
      catalog.value = catalogRes.data
      const { known, invalid } = splitKnownCodes(
        permissionRes.data.permissionCodes,
        permissionRes.data.invalidCodes,
        catalogRes.data,
      )
      selected.value = known
      invalidCodes.value = invalid
      dataScopes.value = { ...permissionRes.data.dataScopes }
      fieldModes.value = jsonClone(permissionRes.data.fieldModes)
      invalidScopes.value = [...permissionRes.data.invalidScopes]
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function handleSubmit() {
    if (!loaded.value || loading.value || saving.value) return
    saving.value = true
    try {
      if (!operationAccess.value) return
    const { error } = await fetchUpdateRolePermissions(props.roleId, {
        permissionCodes: [...selected.value],
        dataScopes: { ...dataScopes.value },
        fieldModes: jsonClone(fieldModes.value),
      })
      if (error) return
      window.$message?.success?.($t("common.modifySuccess"))
      emit("saved")
      closeModal()
    } finally {
      saving.value = false
    }
  }

  watch(visible, (val) => {
    if (val) {
      loadData()
    }
  })
</script>

<template>
  <NModal
    v-model:show="visible"
    :title="$t('page.manage.role.permissionConfig')"
    preset="card"
    class="w-1160px max-w-[calc(100vw-32px)]"
  >
    <NSpin :show="loading">
      <NSpace vertical :size="16">
        <NAlert v-if="invalidCodes.length" type="error" :title="$t('page.manage.role.invalidCodes')">
          <NSpace :size="8">
            <NTag v-for="code in invalidCodes" :key="code" type="error" size="small">{{ code }}</NTag>
          </NSpace>
        </NAlert>
        <NAlert v-if="invalidScopes.length" type="warning" :title="$t('page.manage.role.invalidScopes')">
          <NSpace :size="8">
            <NTag
              v-for="item in invalidScopes"
              :key="invalidScopeKey(item.resource, item.group)"
              type="warning"
              size="small"
            >
              {{ invalidScopeKey(item.resource, item.group) }}: {{ item.stored }} → {{ item.effective }}
            </NTag>
          </NSpace>
        </NAlert>
        <NDataTable :columns="columns" :data="rows" :row-key="rowKey" :max-height="420" size="small" />
      </NSpace>
    </NSpin>
    <template #footer>
      <NSpace justify="end">
        <NButton size="small" @click="closeModal">
          {{ $t("common.cancel") }}
        </NButton>
        <NButton
          type="primary"
          size="small"
          :disabled="loading || !loaded || saving"
          :loading="saving"
          @click="handleSubmit"
        >
          {{ $t("common.confirm") }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped></style>
