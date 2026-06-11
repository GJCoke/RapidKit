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
  const { defaultRequiredRule, formRules, patternRules } = useFormRules()
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
    phone: string
    avatar: string
    nickname: string
    gender: string | null
    roles: string[]
    status: Api.Common.EnableStatus | null
    isAdmin: boolean
    departmentId: string | null
    remark: string
  }

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      username: "",
      name: "",
      email: "",
      password: "",
      phone: "",
      avatar: "",
      nickname: "",
      gender: null,
      roles: [],
      status: "1",
      isAdmin: false,
      departmentId: null,
      remark: "",
    }
  }

  const genderOptions = [
    { label: $t("page.manage.user.genderOptions.male"), value: "male" },
    { label: $t("page.manage.user.genderOptions.female"), value: "female" },
    { label: $t("page.manage.user.genderOptions.other"), value: "other" },
  ]

  type RuleKey = Extract<keyof Model, "username" | "name" | "email" | "status">

  const rules = computed<Record<RuleKey, App.Global.FormRule | App.Global.FormRule[]>>(() => {
    return {
      username: [defaultRequiredRule, patternRules.username],
      name: [
        defaultRequiredRule,
        { min: 2, max: 100, message: $t("page.manage.user.form.nameLengthRule"), trigger: "change" },
      ],
      email: formRules.email,
      status: defaultRequiredRule,
    }
  })

  const passwordRules = computed(() => (props.operateType === "add" ? formRules.pwd : undefined))

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
      const { username, name, email, phone, avatar, nickname, gender, roles, status, isAdmin, departmentId, remark } =
        jsonClone(props.rowData)
      Object.assign(model.value, {
        username,
        name,
        email,
        phone: phone || "",
        avatar: avatar || "",
        nickname: nickname || "",
        gender,
        roles,
        status,
        isAdmin,
        departmentId,
        remark: remark || "",
      })
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

    const commonFields = {
      username: model.value.username,
      name: model.value.name,
      email: model.value.email,
      phone: model.value.phone || undefined,
      avatar: model.value.avatar || undefined,
      nickname: model.value.nickname || undefined,
      gender: model.value.gender ?? undefined,
      roles: model.value.roles,
      status: model.value.status ?? undefined,
      isAdmin: model.value.isAdmin,
      departmentId: model.value.departmentId || null,
      remark: model.value.remark || undefined,
    }

    if (props.operateType === "add") {
      const encryptedPassword = await encryptPassword(model.value.password)
      const { error } = await fetchCreateUser({
        ...commonFields,
        status: model.value.status!,
        password: encryptedPassword,
      })
      if (error) return
    } else {
      const { error } = await fetchUpdateUser(props.rowData!.id!, commonFields)
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
        <NFormItem :label="$t('page.manage.user.phone')" path="phone">
          <NInput v-model:value="model.phone" :placeholder="$t('page.manage.user.form.phone')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.user.nickname')" path="nickname">
          <NInput v-model:value="model.nickname" :placeholder="$t('page.manage.user.form.nickname')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.user.gender')" path="gender">
          <NRadioGroup v-model:value="model.gender">
            <NRadio v-for="item in genderOptions" :key="item.value" :value="item.value" :label="item.label" />
          </NRadioGroup>
        </NFormItem>
        <NFormItem
          v-if="operateType === 'add'"
          :label="$t('page.manage.user.password')"
          path="password"
          :rule="passwordRules"
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
        <NFormItem :label="$t('page.manage.user.remark')" path="remark">
          <NInput v-model:value="model.remark" type="textarea" :placeholder="$t('page.manage.user.form.remark')" />
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
