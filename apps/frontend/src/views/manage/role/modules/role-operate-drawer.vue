<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { jsonClone } from "@rapidkit/utils"
  import { useBoolean } from "@rapidkit/hooks"
  import { enableStatusOptions } from "@/constants/business"
  import { fetchCreateRole, fetchGetAllDataPolicies, fetchGetAllFieldPolicies, fetchUpdateRole } from "@/service/api"
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
    dataPolicyIds: string[]
    fieldPolicyIds: string[]
  }

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      name: "",
      code: "",
      description: "",
      status: null,
      dataPolicyIds: [],
      fieldPolicyIds: [],
    }
  }

  type RuleKey = Extract<keyof Model, "name" | "code" | "status">

  const rules: Record<RuleKey, App.Global.FormRule> = {
    name: defaultRequiredRule,
    code: defaultRequiredRule,
    status: defaultRequiredRule,
  }

  // Data policy options
  const policyOptions = ref<Array<{ label: string; value: string }>>([])

  async function loadPolicies() {
    const { data, error } = await fetchGetAllDataPolicies()
    if (error) return
    policyOptions.value = data.map((p: Api.DataPolicy.Policy) => ({
      label: p.name,
      value: p.id,
    }))
  }

  // Field policy options
  const fieldPolicyOptions = ref<Array<{ label: string; value: string }>>([])

  async function loadFieldPolicies() {
    const { data, error } = await fetchGetAllFieldPolicies()
    if (error) return
    fieldPolicyOptions.value = data.map((p: Api.FieldPolicy.Policy) => ({
      label: p.name,
      value: p.id,
    }))
  }

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
      loadPolicies()
      loadFieldPolicies()
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
        <NFormItem :label="$t('page.manage.role.dataPolicies')" path="dataPolicyIds">
          <NSelect
            v-model:value="model.dataPolicyIds"
            :options="policyOptions"
            multiple
            clearable
            placeholder="选择数据策略（不选则不限制）"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.role.fieldPolicy')" path="fieldPolicyIds">
          <NSelect
            v-model:value="model.fieldPolicyIds"
            :options="fieldPolicyOptions"
            multiple
            clearable
            :placeholder="$t('page.manage.role.fieldPolicyPlaceholder')"
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
