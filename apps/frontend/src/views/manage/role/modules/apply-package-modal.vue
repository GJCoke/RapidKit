<script setup lang="ts">
  import { computed, shallowRef, watch } from "vue"
  import { useOperationAccess } from "@/hooks/business/table-actions/use-operation-access"
  import { fetchApplyPermissionPackages, fetchGetAllPermissionPackages, fetchGetRolePermissions } from "@/service/api"
  import { $t } from "@/locales"
  import { computePackageApplyDiff, formatScopeChange, type RoleGrant } from "./package-apply-diff"

  defineOptions({ name: "ApplyPackageModal" })

  interface Props {
    roleId: string
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ applied: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })

  const operationAccess = useOperationAccess(() => "role:grant", visible)

  const packages = shallowRef<Api.PermissionPackage.Package[]>([])
  const current = shallowRef<RoleGrant>({ permissionCodes: [], dataScopes: {}, fieldModes: {} })
  const selectedKeys = shallowRef<string[]>([])
  const mode = shallowRef<Api.PermissionPackage.ApplyMode>("merge")
  const submitting = shallowRef(false)
  const loading = shallowRef(false)
  const loaded = shallowRef(false)
  let loadVersion = 0

  const packageOptions = computed(() =>
    packages.value.map((item) => ({ label: `${item.label}（${item.key}）`, value: item.key })),
  )

  const diff = computed(() => {
    const byKey = new Map(packages.value.map((item) => [item.key, item]))
    const selected = selectedKeys.value
      .map((key) => byKey.get(key))
      .filter((item): item is Api.PermissionPackage.Package => !!item)
    return computePackageApplyDiff(current.value, selected, mode.value)
  })

  const scopeChangeLabels = computed(() => diff.value.scopeChanges.map(formatScopeChange))

  async function loadData() {
    const version = ++loadVersion
    loading.value = true
    loaded.value = false
    packages.value = []
    selectedKeys.value = []
    mode.value = "merge"
    try {
      const [packageRes, permissionRes] = await Promise.all([
        fetchGetAllPermissionPackages(),
        fetchGetRolePermissions(props.roleId),
      ])
      if (version !== loadVersion || packageRes.error || permissionRes.error) return
      packages.value = packageRes.data
      current.value = {
        permissionCodes: [...permissionRes.data.permissionCodes, ...(permissionRes.data.invalidCodes ?? [])],
        dataScopes: permissionRes.data.dataScopes,
        fieldModes: permissionRes.data.fieldModes,
      }
      loaded.value = true
    } finally {
      if (version === loadVersion) loading.value = false
    }
  }

  async function handleSubmit() {
    if (!operationAccess.value) return
    if (!loaded.value || loading.value || submitting.value || !selectedKeys.value.length || !diff.value.hasChanges)
      return
    submitting.value = true
    try {
      const { error } = await fetchApplyPermissionPackages(props.roleId, {
        packageKeys: [...selectedKeys.value],
        mode: mode.value,
      })
      if (error) return
      window.$message?.success($t("page.manage.role.applyPackage.success"))
      visible.value = false
      emit("applied")
    } finally {
      submitting.value = false
    }
  }

  watch([visible, () => props.roleId], ([show]) => {
    if (show) loadData()
    else {
      ++loadVersion
      loaded.value = false
      loading.value = false
    }
  })
</script>

<template>
  <NModal
    v-model:show="visible"
    :title="$t('page.manage.role.applyPackage.title')"
    preset="card"
    class="w-640px max-w-[calc(100vw-32px)]"
  >
    <NForm label-placement="top" :disabled="loading || !loaded || submitting">
      <NFormItem :label="$t('page.manage.role.applyPackage.packages')">
        <NSelect
          v-model:value="selectedKeys"
          :disabled="loading || !loaded || submitting"
          :options="packageOptions"
          :placeholder="$t('page.manage.role.applyPackage.packagesPlaceholder')"
          multiple
          filterable
        />
      </NFormItem>
      <NFormItem :label="$t('page.manage.role.applyPackage.mode')">
        <NRadioGroup v-model:value="mode">
          <NSpace vertical>
            <NRadio value="merge">
              {{ $t("page.manage.role.applyPackage.modeMerge") }} —
              {{ $t("page.manage.role.applyPackage.modeMergeHint") }}
            </NRadio>
            <NRadio value="replace">
              {{ $t("page.manage.role.applyPackage.modeReplace") }} —
              {{ $t("page.manage.role.applyPackage.modeReplaceHint") }}
            </NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
    </NForm>

    <div v-if="selectedKeys.length > 0" class="flex-col gap-8px">
      <div class="font-medium">{{ $t("page.manage.role.applyPackage.preview") }}</div>
      <NEmpty v-if="!diff.hasChanges" :description="$t('page.manage.role.applyPackage.noChange')" size="small" />
      <template v-else>
        <div v-if="diff.addedCodes.length || diff.removedCodes.length" class="flex-col gap-4px">
          <div class="text-12px text-[var(--n-text-color-3)]">{{ $t("page.manage.role.applyPackage.codes") }}</div>
          <div class="flex flex-wrap gap-4px">
            <NTag v-for="item in diff.addedCodes" :key="`add-${item}`" size="small" type="success"> + {{ item }} </NTag>
            <NTag v-for="item in diff.removedCodes" :key="`remove-${item}`" size="small" type="error">
              − {{ item }}
            </NTag>
          </div>
        </div>
        <div v-if="scopeChangeLabels.length" class="flex-col gap-4px">
          <div class="text-12px text-[var(--n-text-color-3)]">{{ $t("page.manage.role.applyPackage.scopes") }}</div>
          <div class="flex flex-wrap gap-4px">
            <NTag v-for="item in scopeChangeLabels" :key="item" size="small" type="info">{{ item }}</NTag>
          </div>
        </div>
      </template>
      <NText depth="3" class="text-12px">{{ $t("page.manage.role.applyPackage.oneTimeHint") }}</NText>
    </div>

    <template #footer>
      <NSpace justify="end">
        <NButton size="small" @click="visible = false">{{ $t("common.cancel") }}</NButton>
        <NButton
          type="primary"
          size="small"
          :loading="submitting"
          :disabled="loading || !loaded || submitting || selectedKeys.length === 0 || !diff.hasChanges"
          @click="handleSubmit"
        >
          {{ $t("common.confirm") }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>
