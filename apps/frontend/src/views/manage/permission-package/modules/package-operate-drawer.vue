<script setup lang="ts">
  import { computed, reactive, ref, shallowRef, watch } from "vue"
  import type { SelectGroupOption } from "naive-ui"
  import { jsonClone } from "@rapidkit/utils"
  import { useOperationAccess } from "@/hooks/business/table-actions/use-operation-access"
  import { fetchCreatePermissionPackage, fetchGetPermissionCatalog, fetchUpdatePermissionPackage } from "@/service/api"
  import { useAuth } from "@/hooks/business/auth"
  import { $t } from "@/locales"
  import ResourceScopeCell from "@/views/manage/role/modules/resource-scope-cell.vue"
  import {
    resourcesForCodes,
    type DataScopes,
    type FieldModes,
    type ScopeResource,
  } from "@/views/manage/role/modules/resource-scope"

  defineOptions({ name: "PackageOperateDrawer" })

  interface Props {
    operateType: "add" | "edit"
    rowData?: Api.PermissionPackage.Package | null
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ submitted: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const { hasAuth } = useAuth()

  const operationAccess = useOperationAccess(
    () => (props.operateType === "edit" ? "permission-package:update" : "permission-package:create"),
    undefined,
    () => props.operateType !== "edit" || !props.rowData?.builtin,
  )
  const readonly = computed(
    () => props.operateType === "edit" && (!!props.rowData?.builtin || !hasAuth("permission-package:update")),
  )

  const title = computed(() => {
    if (props.operateType === "add") return $t("page.manage.permissionPackage.addPackage")
    return readonly.value
      ? $t("page.manage.permissionPackage.viewPackage")
      : $t("page.manage.permissionPackage.editPackage")
  })

  const loading = ref(false)
  const loaded = ref(false)
  const saving = ref(false)
  let loadVersion = 0
  const canSubmit = computed(
    () =>
      !readonly.value &&
      operationAccess.value &&
      loaded.value &&
      !loading.value &&
      !saving.value &&
      !!formData.label.trim() &&
      formData.codes.length > 0 &&
      (props.operateType !== "add" || /^[a-z][a-z0-9-]{0,92}$/.test(formData.keySuffix)),
  )

  const codeOptions = ref<SelectGroupOption[]>([])
  const catalogResources = shallowRef<ScopeResource[]>([])

  const formData = reactive({
    keySuffix: "",
    label: "",
    description: "",
    codes: [] as string[],
    dataScopes: {} as DataScopes,
    fieldModes: {} as FieldModes,
  })

  const scopedResources = computed(() => resourcesForCodes(formData.codes, catalogResources.value))

  function resetForm() {
    formData.keySuffix = ""
    formData.label = ""
    formData.description = ""
    formData.codes = []
    formData.dataScopes = {}
    formData.fieldModes = {}
  }

  function initEditForm() {
    if (!props.rowData) return
    formData.keySuffix = props.rowData.key.replace(/^custom\./, "")
    formData.label = props.rowData.label
    formData.description = props.rowData.description
    formData.codes = [...props.rowData.codes]
    formData.dataScopes = { ...props.rowData.dataScopes }
    formData.fieldModes = jsonClone(props.rowData.fieldModes)
  }

  async function loadOptions() {
    const version = ++loadVersion
    loading.value = true
    loaded.value = false
    codeOptions.value = []
    catalogResources.value = []
    try {
      const catalogRes = await fetchGetPermissionCatalog()
      if (version !== loadVersion || catalogRes.error) return
      codeOptions.value = catalogRes.data.resources.map((resource) => ({
        type: "group",
        key: resource.key,
        label: resource.label,
        children: catalogRes.data.codes
          .filter((code) => code.resource === resource.key)
          .map((code) => ({ label: `${code.label}（${code.code}）`, value: code.code })),
      }))
      catalogResources.value = catalogRes.data.resources
      loaded.value = true
    } finally {
      if (version === loadVersion) loading.value = false
    }
  }

  async function handleSubmit() {
    if (!canSubmit.value) return
    saving.value = true
    try {
      const scopes = { dataScopes: { ...formData.dataScopes }, fieldModes: jsonClone(formData.fieldModes) }
      if (props.operateType === "add") {
        const { error } = await fetchCreatePermissionPackage({
          key: `custom.${formData.keySuffix}`,
          label: formData.label,
          description: formData.description,
          codes: formData.codes,
          ...scopes,
        })
        if (error) return
        window.$message?.success($t("common.addSuccess"))
      } else if (props.rowData) {
        const { error } = await fetchUpdatePermissionPackage(props.rowData.id, {
          label: formData.label,
          description: formData.description,
          codes: formData.codes,
          ...scopes,
        })
        if (error) return
        window.$message?.success($t("common.updateSuccess"))
      }
      visible.value = false
      emit("submitted")
    } finally {
      saving.value = false
    }
  }

  watch(visible, (val) => {
    if (!val) {
      ++loadVersion
      loaded.value = false
      loading.value = false
      return
    }
    loadOptions()
    if (props.operateType === "edit") initEditForm()
    else resetForm()
  })
</script>

<template>
  <NDrawer v-model:show="visible" :width="640">
    <NDrawerContent :title="title" closable>
      <NAlert v-if="rowData?.builtin" type="info" :bordered="false" class="mb-16px">
        {{ $t("page.manage.permissionPackage.builtinReadonly") }}
      </NAlert>
      <NForm :model="formData" label-placement="top" :disabled="readonly || loading || !loaded || saving">
        <NFormItem :label="$t('page.manage.permissionPackage.key')" path="keySuffix">
          <NInput
            v-if="operateType === 'add'"
            v-model:value="formData.keySuffix"
            :placeholder="$t('page.manage.permissionPackage.form.key')"
            :maxlength="93"
            :allow-input="(value: string) => /^[a-z0-9-]*$/.test(value)"
          >
            <template #prefix>custom.</template>
          </NInput>
          <NInput v-else :value="rowData?.key" disabled />
        </NFormItem>
        <NFormItem :label="$t('page.manage.permissionPackage.label')" path="label">
          <NInput
            v-model:value="formData.label"
            :maxlength="100"
            :placeholder="$t('page.manage.permissionPackage.form.label')"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.permissionPackage.description')" path="description">
          <NInput v-model:value="formData.description" :maxlength="500" type="textarea" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.permissionPackage.codes')" path="codes">
          <NSelect
            v-model:value="formData.codes"
            :options="codeOptions"
            :placeholder="$t('page.manage.permissionPackage.form.codes')"
            multiple
            filterable
            max-tag-count="responsive"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.permissionPackage.scopes')">
          <div class="w-full flex-col gap-8px">
            <div v-for="resource in scopedResources" :key="resource.key" class="flex items-center gap-12px">
              <span class="w-80px shrink-0">{{ resource.label }}</span>
              <ResourceScopeCell
                v-model:data-scopes="formData.dataScopes"
                v-model:field-modes="formData.fieldModes"
                :resource="resource"
                preserve-defaults
              />
            </div>
            <NText v-if="!scopedResources.length" depth="3" class="text-12px">
              {{ $t("page.manage.permissionPackage.form.scopesEmpty") }}
            </NText>
          </div>
        </NFormItem>
      </NForm>
      <template #footer>
        <NButton v-if="!readonly" type="primary" :disabled="!canSubmit" :loading="saving" @click="handleSubmit">
          {{ $t("common.confirm") }}
        </NButton>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
