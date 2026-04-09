<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { jsonClone, rsaEncrypt } from "@rapidkit/utils"
  import { enableStatusOptions } from "@/constants/business"
  import { fetchCreateUser, fetchGetAllRoles, fetchGetPublicKey, fetchUpdateUser } from "@/service/api"
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

  // password is required only on create
  const passwordRules = computed(() => {
    if (props.operateType === "add") {
      return defaultRequiredRule
    }
    return undefined
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

  function handleInitModel() {
    model.value = createDefaultModel()

    if (props.operateType === "edit" && props.rowData) {
      const { username, name, email, roles, status, isAdmin } = jsonClone(props.rowData)
      Object.assign(model.value, { username, name, email, roles, status, isAdmin })
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
      })
      if (error) return
    } else {
      const updateData: Record<string, unknown> = {
        username: model.value.username,
        name: model.value.name,
        email: model.value.email,
        roles: model.value.roles,
        status: model.value.status ?? undefined,
        isAdmin: model.value.isAdmin,
      }

      if (model.value.password) {
        updateData.password = await encryptPassword(model.value.password)
      }

      const { error } = await fetchUpdateUser(props.rowData!.id, updateData)
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
        <NFormItem :label="$t('page.manage.user.password')" path="password" :rule="passwordRules">
          <NInput
            v-model:value="model.password"
            type="password"
            show-password-on="click"
            :placeholder="
              operateType === 'add' ? $t('page.manage.user.form.password') : $t('page.manage.user.form.passwordEdit')
            "
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
