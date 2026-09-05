<script setup lang="ts">
  import { computed, nextTick, ref, shallowRef, watch } from "vue"
  import { jsonClone } from "@rapidkit/utils"
  import { enableStatusOptions } from "@/constants/business"
  import type { InputInst, TreeSelectOption } from "naive-ui"
  import {
    fetchCreateUser,
    fetchGetAllRoles,
    fetchGetDepartmentTree,
    fetchUpdateUser,
    fetchValidateUsernamePinyin,
  } from "@/service/api"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { useAuthStore } from "@/store/modules/auth"
  import { createUsernamePinyinState } from "../composables/use-username-pinyin"

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
  const usernameInputRef = ref<InputInst | null>(null)
  const submitting = ref(false)
  const pinyinState = createUsernamePinyinState(props.operateType)
  let validationTimer: ReturnType<typeof setTimeout> | undefined

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

  async function submitUser() {
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
      const { error } = await fetchCreateUser({ ...commonFields, status: model.value.status! })
      if (error) return
    } else {
      const { error } = await fetchUpdateUser(props.rowData!.id!, commonFields)
      if (error) return
    }

    window.$message?.success($t("common.updateSuccess"))
    closeDrawer()
    emit("submitted")
  }

  async function runPinyinValidation(allowAutofill = true) {
    const name = model.value.name
    const username = model.value.username
    const requestId = pinyinState.beginRequest()
    const { data, error } = await fetchValidateUsernamePinyin({ name, username })

    if (name !== model.value.name || username !== model.value.username) return null
    if (error) {
      pinyinState.reject(requestId)
      return null
    }

    const update = pinyinState.accept(requestId, data, allowAutofill)
    if (update.username !== undefined && update.username !== model.value.username) {
      model.value.username = update.username
    }
    return data
  }

  function schedulePinyinValidation() {
    if (validationTimer !== undefined) clearTimeout(validationTimer)
    if (model.value.name.trim().length < 2) {
      pinyinState.clearValidation()
      return
    }
    validationTimer = setTimeout(() => runPinyinValidation(), 300)
  }

  function handleUsernameUpdate(username: string) {
    pinyinState.markUsernameEdited()
    model.value.username = username
  }

  function confirmPinyinSubmission(result: Api.SystemManage.UsernamePinyinValidation | null) {
    const content = result
      ? $t("page.manage.user.usernamePinyinConfirmContent", {
          current: model.value.username,
          suggested: result.suggestedUsername,
        })
      : $t("page.manage.user.usernamePinyinCheckFailed")

    return new Promise<boolean>((resolve) => {
      if (!window.$dialog) {
        resolve(window.confirm(content))
        return
      }
      window.$dialog.warning({
        title: result
          ? $t("page.manage.user.usernamePinyinConfirmTitle")
          : $t("page.manage.user.usernamePinyinCheckFailed"),
        content,
        positiveText: $t("page.manage.user.submitAnyway"),
        negativeText: $t("page.manage.user.returnToEdit"),
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => {
          resolve(false)
          nextTick(() => usernameInputRef.value?.focus())
        },
        onClose: () => resolve(false),
      })
    })
  }

  async function handleSubmit() {
    if (submitting.value) return
    await validate()

    if (validationTimer !== undefined) clearTimeout(validationTimer)
    submitting.value = true
    try {
      const result = await runPinyinValidation(false)
      if ((!result || !result.consistent) && !(await confirmPinyinSubmission(result))) return
      await submitUser()
    } finally {
      submitting.value = false
    }
  }

  watch(visible, () => {
    if (visible.value) {
      if (validationTimer !== undefined) clearTimeout(validationTimer)
      pinyinState.reset(props.operateType)
      handleInitModel()
      restoreValidation()
      getRoleOptions()
      loadDeptTree()
    }
  })

  watch(() => [model.value.name, model.value.username], schedulePinyinValidation, { flush: "post" })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="360">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules">
        <NFormItem :label="$t('page.manage.user.name')" path="name">
          <NInput v-model:value="model.name" :placeholder="$t('page.manage.user.form.name')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.user.username')" path="username">
          <div class="w-full flex-col-stretch gap-6px">
            <NInput
              ref="usernameInputRef"
              :value="model.username"
              :placeholder="$t('page.manage.user.form.username')"
              @update:value="handleUsernameUpdate"
            />
            <div v-if="pinyinState.consistent.value === false" class="text-12px text-warning">
              {{
                $t("page.manage.user.usernamePinyinWarning", {
                  username: pinyinState.suggestedUsername.value,
                })
              }}
            </div>
          </div>
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
        <NFormItem v-if="operateType === 'add'" :show-label="false">
          <NAlert type="info" :bordered="false" class="w-full">
            {{ $t("page.manage.user.inviteNote") }}
          </NAlert>
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
          <NButton type="primary" :loading="submitting" :disabled="submitting" @click="handleSubmit">
            {{ $t("common.confirm") }}
          </NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped></style>
