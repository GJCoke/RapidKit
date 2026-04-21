<script setup lang="ts">
  import { computed, ref, shallowRef, watch, type ComputedRef } from "vue"
  import type { TreeSelectOption } from "naive-ui"
  import { jsonClone } from "@rapidkit/utils"
  import { useBoolean } from "@rapidkit/hooks"
  import { dataScopeOptions, enableStatusOptions } from "@/constants/business"
  import { fetchCreateRole, fetchGetAllDataRules, fetchGetDepartmentTree, fetchUpdateRole } from "@/service/api"
  import { translateOptions } from "@/utils/common"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import PermissionModal from "./permission-modal.vue"

  defineOptions({
    name: "RoleOperateDrawer",
  })

  interface Props {
    /** the type of operation */
    operateType: NaiveUI.TableOperateType
    /** the edit row data */
    rowData?: Partial<Api.SystemManage.Role> | null
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "submitted"): void
  }

  const emit = defineEmits<Emits>()

  const visible = defineModel<boolean>("visible", {
    default: false,
  })

  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()
  const { bool: permissionVisible, setTrue: openPermissionModal } = useBoolean()
  const { hasAuth } = useAuth()

  const title = computed(() => {
    const titles: Record<NaiveUI.TableOperateType, string> = {
      add: $t("page.manage.role.addRole"),
      edit: $t("page.manage.role.editRole"),
    }
    return titles[props.operateType]
  })

  type Model = Pick<Api.SystemManage.Role, "name" | "code" | "description" | "status"> & {
    dataScope: Api.SystemManage.DataScopeType
    customDeptIds: string[]
    dataRuleIds: string[]
  }

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      name: "",
      code: "",
      description: "",
      status: null,
      dataScope: 2,
      customDeptIds: [],
      dataRuleIds: [],
    }
  }

  type RuleKey = Extract<keyof Model, "name" | "code" | "status">

  const rules: Record<RuleKey, App.Global.FormRule> = {
    name: defaultRequiredRule,
    code: defaultRequiredRule,
    status: defaultRequiredRule,
  }

  // Department tree options for custom dept select
  const deptTreeOptions = shallowRef<TreeSelectOption[]>([])

  function buildDeptTreeSelect(departments: Api.SystemManage.DepartmentTree[]): TreeSelectOption[] {
    return departments.map((dept) => ({
      key: dept.id,
      label: dept.name,
      children: dept.children?.length ? buildDeptTreeSelect(dept.children) : undefined,
    }))
  }

  async function loadDeptTree() {
    const { data, error } = await fetchGetDepartmentTree()
    if (error) return
    deptTreeOptions.value = buildDeptTreeSelect(data)
  }

  // Data rule options
  const dataRuleOptions = ref<Array<{ label: string; value: string }>>([])

  async function loadDataRuleOptions() {
    const { data, error } = await fetchGetAllDataRules()
    if (error) return
    dataRuleOptions.value = data.map((r: Api.SystemManage.DataRule) => ({
      label: `${r.name} (${r.modelName}.${r.field})`,
      value: r.id,
    }))
  }

  const numericDataScopeOptions = computed(() =>
    translateOptions(dataScopeOptions).map((opt) => ({ ...opt, value: Number(opt.value) })),
  )

  const roleId = computed(() => props.rowData?.id || "")

  const isEdit = computed(() => props.operateType === "edit")

  function handleInitModel() {
    model.value = createDefaultModel()

    if (props.operateType === "edit" && props.rowData) {
      Object.assign(model.value, jsonClone(props.rowData))
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  async function handleSubmit() {
    await validate()

    if (props.operateType === "add") {
      const { error } = await fetchCreateRole(model.value)
      if (error) return
    } else {
      const { error } = await fetchUpdateRole(props.rowData!.id!, model.value)
      if (error) return
    }

    window.$message?.success($t("common.updateSuccess"))
    closeDrawer()
    emit("submitted")
  }

  watch(visible, () => {
    if (visible.value) {
      handleInitModel()
      restoreValidation()
      loadDeptTree()
      loadDataRuleOptions()
    }
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="360">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules">
        <NFormItem :label="$t('page.manage.role.roleName')" path="name">
          <NInput v-model:value="model.name" :placeholder="$t('page.manage.role.form.roleName')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.role.roleCode')" path="code">
          <NInput v-model:value="model.code" :placeholder="$t('page.manage.role.form.roleCode')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.role.roleStatus')" path="status">
          <NRadioGroup v-model:value="model.status">
            <NRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value" :label="$t(item.label)" />
          </NRadioGroup>
        </NFormItem>
        <NFormItem :label="$t('page.manage.role.roleDesc')" path="description">
          <NInput v-model:value="model.description" :placeholder="$t('page.manage.role.form.roleDesc')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.role.dataScope')" path="dataScope">
          <NSelect
            v-model:value="model.dataScope"
            :options="numericDataScopeOptions"
            :placeholder="$t('page.manage.role.dataScopeConfig')"
          />
        </NFormItem>
        <NFormItem v-if="model.dataScope === 5" :label="$t('page.manage.role.customDepartments')" path="customDeptIds">
          <NTreeSelect
            v-model:value="model.customDeptIds"
            multiple
            checkable
            cascade
            :options="deptTreeOptions"
            :placeholder="$t('page.manage.role.customDepartments')"
            default-expand-all
          />
        </NFormItem>
        <NFormItem v-if="model.dataScope === 6" :label="$t('page.manage.role.customRules')" path="dataRuleIds">
          <NSelect
            v-model:value="model.dataRuleIds"
            multiple
            :options="dataRuleOptions"
            :placeholder="$t('page.manage.role.customRules')"
            filterable
          />
        </NFormItem>
      </NForm>
      <NSpace v-if="isEdit">
        <NButton v-if="hasAuth('manage_role:permission')" @click="openPermissionModal">
          {{ $t("page.manage.role.permissionConfig") }}
        </NButton>
        <PermissionModal v-model:visible="permissionVisible" :role-id="roleId" />
      </NSpace>
      <template #footer>
        <NSpace :size="16">
          <NButton @click="closeDrawer">{{ $t("common.cancel") }}</NButton>
          <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped></style>
