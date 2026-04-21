<script setup lang="ts">
  import { computed, ref, shallowRef, watch } from "vue"
  import { jsonClone, rsaEncrypt } from "@rapidkit/utils"
  import { enableStatusOptions } from "@/constants/business"
  import type { TreeSelectOption } from "naive-ui"
  import {
    fetchCreateUser,
    fetchGetAllRoles,
    fetchGetDepartmentTree,
    fetchGetPublicKey,
    fetchUpdateUser,
  } from "@/service/api"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { useAuthStore } from "@/store/modules/auth"

  defineOptions({
    name: "UserOperateDrawer",
  })

  interface Props {
    /** the type of operation */
    operateType: NaiveUI.TableOperateType
    /** the edit row data */
    rowData?: Api.SystemManage.User | null
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
  const authStore = useAuthStore()

  const title = computed(() => {
    const titles: Record<NaiveUI.TableOperateType, string> = {
      add: $t("page.manage.user.addUser"),
      edit: $t("page.manage.user.editUser"),
    }
    return titles[props.operateType]
  })

  type Model = {
    username: string
    name: string
    email: string
    password: string
    roles: string[]
    status: Api.Common.EnableStatus | null
    isAdmin: boolean
    departmentId: string | null
  }

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      username: "",
      name: "",
      email: "",
      password: "",
      roles: [],
      status: null,
      isAdmin: false,
      departmentId: null,
    }
  }

  type RuleKey = Extract<keyof Model, "username" | "name" | "status">

  const rules = computed<Record<RuleKey, App.Global.FormRule>>(() => {
    return {
      username: defaultRequiredRule,
      name: defaultRequiredRule,
      status: defaultRequiredRule,
    }
  })

  const passwordRequired = computed(() => (props.operateType === "add" ? defaultRequiredRule : undefined))

  /** the enabled role options */
  const roleOptions = ref<CommonType.Option<string>[]>([])

  async function getRoleOptions() {
    const { error, data } = await fetchGetAllRoles()

    if (!error) {
      roleOptions.value = data.map((item) => ({
        label: item.name,
        value: item.code,
      }))
    }
  }

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

  function handleInitModel() {
    model.value = createDefaultModel()

    if (props.operateType === "edit" && props.rowData) {
      const { username, name, email, roles, status, isAdmin, departmentId } = jsonClone(props.rowData)
      Object.assign(model.value, { username, name, email, roles, status, isAdmin, departmentId })
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  async function encryptPassword(password: string): Promise<string> {
    const { data: publicKey } = await fetchGetPublicKey()
    return rsaEncrypt(publicKey!, password)
  }

  async function handleSubmit() {
    await validate()

    if (props.operateType === "add") {
      const encryptedPassword = await encryptPassword(model.value.password)
      const { error } = await fetchCreateUser({
        username: model.value.username,
        name: model.value.name,
        email: model.value.email,
        password: encryptedPassword,
        roles: model.value.roles,
        status: model.value.status ?? undefined,
        isAdmin: model.value.isAdmin,
        departmentId: model.value.departmentId ?? undefined,
      })
      if (error) return
    } else {
      const { error } = await fetchUpdateUser(props.rowData!.id!, {
        username: model.value.username,
        name: model.value.name,
        email: model.value.email,
        roles: model.value.roles,
        status: model.value.status ?? undefined,
        isAdmin: model.value.isAdmin,
        departmentId: model.value.departmentId ?? undefined,
      })
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
      getRoleOptions()
      loadDeptTree()
    }
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="360">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules">
        <NFormItem :label="$t('page.manage.user.username')" path="username">
          <NInput v-model:value="model.username" :placeholder="$t('page.manage.user.form.username')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.user.name')" path="name">
          <NInput v-model:value="model.name" :placeholder="$t('page.manage.user.form.name')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.user.userEmail')" path="email">
          <NInput v-model:value="model.email" :placeholder="$t('page.manage.user.form.userEmail')" />
        </NFormItem>
        <NFormItem
          v-if="operateType === 'add'"
          :label="$t('page.manage.user.password')"
          path="password"
          :rule="passwordRequired"
        >
          <NInput
            v-model:value="model.password"
            type="password"
            show-password-on="click"
            :placeholder="$t('page.manage.user.form.password')"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.user.userStatus')" path="status">
          <NRadioGroup v-model:value="model.status">
            <NRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value" :label="$t(item.label)" />
          </NRadioGroup>
        </NFormItem>
        <NFormItem :label="$t('page.manage.user.userRole')" path="roles">
          <NSelect
            v-model:value="model.roles"
            multiple
            :options="roleOptions"
            :placeholder="$t('page.manage.user.form.userRole')"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.department.title')" path="departmentId">
          <NTreeSelect
            v-model:value="model.departmentId"
            :options="deptTreeOptions"
            :placeholder="$t('page.manage.department.form.parentDepartment')"
            clearable
            default-expand-all
          />
        </NFormItem>
        <NFormItem v-if="authStore.userInfo.isAdmin" :label="$t('page.manage.user.isAdmin')">
          <NSwitch v-model:value="model.isAdmin" />
        </NFormItem>
      </NForm>
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
