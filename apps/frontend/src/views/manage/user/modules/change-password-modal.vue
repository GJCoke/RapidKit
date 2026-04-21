<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { rsaEncrypt } from "@rapidkit/utils"
  import { fetchChangePassword, fetchGetPublicKey } from "@/service/api"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "ChangePasswordModal" })

  interface Props {
    userId: string
    isSelf: boolean
  }

  const props = defineProps<Props>()

  const visible = defineModel<boolean>("visible", { default: false })

  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const model = ref(createDefaultModel())

  function createDefaultModel() {
    return {
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    }
  }

  const confirmPasswordRule = computed<App.Global.FormRule>(() => ({
    required: true,
    trigger: ["input", "blur"],
    validator(_rule: unknown, value: string) {
      if (!value) return new Error($t("page.manage.user.form.confirmPassword"))
      if (value !== model.value.newPassword) return new Error($t("page.manage.user.passwordMismatch"))
      return true
    },
  }))

  async function handleSubmit() {
    await validate()

    const { data: publicKey } = await fetchGetPublicKey()
    if (!publicKey) return

    const payload: Api.SystemManage.ChangePassword = {
      newPassword: await rsaEncrypt(publicKey, model.value.newPassword),
    }

    if (props.isSelf) {
      payload.oldPassword = await rsaEncrypt(publicKey, model.value.oldPassword)
    }

    const { error } = await fetchChangePassword(props.userId, payload)
    if (error) return

    window.$message?.success($t("common.updateSuccess"))
    visible.value = false
  }

  watch(visible, () => {
    if (visible.value) {
      model.value = createDefaultModel()
      restoreValidation()
    }
  })
</script>

<template>
  <NModal v-model:show="visible" preset="card" :title="$t('page.manage.user.changePassword')" class="w-400px">
    <NForm ref="formRef" :model="model">
      <NFormItem
        v-if="isSelf"
        :label="$t('page.manage.user.oldPassword')"
        path="oldPassword"
        :rule="defaultRequiredRule"
      >
        <NInput
          v-model:value="model.oldPassword"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.manage.user.form.oldPassword')"
        />
      </NFormItem>
      <NFormItem :label="$t('page.manage.user.newPassword')" path="newPassword" :rule="defaultRequiredRule">
        <NInput
          v-model:value="model.newPassword"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.manage.user.form.newPassword')"
        />
      </NFormItem>
      <NFormItem :label="$t('page.manage.user.confirmPassword')" path="confirmPassword" :rule="confirmPasswordRule">
        <NInput
          v-model:value="model.confirmPassword"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.manage.user.form.confirmPassword')"
        />
      </NFormItem>
    </NForm>
    <template #footer>
      <NSpace justify="end" :size="16">
        <NButton @click="visible = false">{{ $t("common.cancel") }}</NButton>
        <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
      </NSpace>
    </template>
  </NModal>
</template>
