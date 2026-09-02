<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from "vue"
  import { useRoute } from "vue-router"
  import { rsaEncrypt } from "@rapidkit/utils"
  import { fetchConfirmPasswordReset, fetchGetPublicKey, fetchValidatePasswordReset } from "@/service/api"
  import { useRouterPush } from "@/hooks/common/router"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "ResetPassword" })

  const route = useRoute()
  const { toggleLoginModule } = useRouterPush()
  const { formRef, validate } = useNaiveForm()
  const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""))
  const tokenValid = ref<boolean | null>(null)
  const submitting = ref(false)
  const model = reactive({ password: "", confirmPassword: "" })
  const rules = computed(() => {
    const { formRules, createConfirmPwdRule } = useFormRules()
    return { password: formRules.pwd, confirmPassword: createConfirmPwdRule(model.password) }
  })

  async function checkToken() {
    if (!token.value) {
      tokenValid.value = false
      return
    }
    const { data, error } = await fetchValidatePasswordReset(token.value)
    tokenValid.value = !error && data?.valid === true
  }

  async function handleSubmit() {
    if (!tokenValid.value || submitting.value) return
    await validate()
    submitting.value = true
    try {
      const { data: publicKey, error: keyError } = await fetchGetPublicKey()
      if (keyError || !publicKey) return
      const newPassword = await rsaEncrypt(publicKey, model.password)
      const { error } = await fetchConfirmPasswordReset({ token: token.value, newPassword })
      if (error) return
      window.$message?.success($t("page.login.resetPassword.success"))
      toggleLoginModule("pwd-login")
    } finally {
      submitting.value = false
    }
  }

  onMounted(checkToken)
</script>

<template>
  <div class="relative flex-col-stretch gap-24px">
    <div class="flex-col-stretch gap-6px">
      <p class="text-12px text-primary font-700 tracking-0.12em uppercase">
        {{ $t("page.login.resetPassword.eyebrow") }}
      </p>
      <h1 class="text-26px text-base-text-1 font-700 lt-sm:text-22px">
        {{ $t("page.login.resetPassword.title") }}
      </h1>
      <p class="text-14px text-base-text-2 leading-22px">
        {{ $t("page.login.resetPassword.description") }}
      </p>
    </div>

    <div v-if="tokenValid === null" class="flex items-center gap-14px rd-12px bg-primary-50 p-18px dark:bg-primary-950">
      <NSpin size="medium" />
      <div>
        <p class="font-600">{{ $t("page.login.resetPassword.checkingTitle") }}</p>
        <p class="mt-4px text-13px text-base-text-2">
          {{ $t("page.login.resetPassword.checkingDescription") }}
        </p>
      </div>
    </div>

    <div
      v-else-if="tokenValid === false"
      class="flex-col-stretch gap-14px rd-12px bg-error-50 p-18px dark:bg-error-950"
    >
      <SvgIcon icon="carbon:link-not-found" class="text-28px text-error" />
      <div>
        <p class="font-600">{{ $t("page.login.resetPassword.invalidTitle") }}</p>
        <p class="mt-4px text-13px text-base-text-2 leading-20px">
          {{ $t("page.login.resetPassword.invalidToken") }}
        </p>
      </div>
      <NButton size="large" round block @click="toggleLoginModule('reset-pwd')">
        {{ $t("page.login.resetPassword.requestAgain") }}
      </NButton>
    </div>

    <NForm
      v-else
      ref="formRef"
      :model="model"
      :rules="rules"
      size="large"
      label-placement="top"
      :show-require-mark="false"
      @keyup.enter="handleSubmit"
    >
      <NFormItem path="password" :label="$t('page.login.resetPassword.passwordLabel')">
        <NInput
          v-model:value="model.password"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.login.common.passwordPlaceholder')"
        />
      </NFormItem>
      <NFormItem path="confirmPassword" :label="$t('page.login.resetPassword.confirmPasswordLabel')">
        <NInput
          v-model:value="model.confirmPassword"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.login.common.confirmPasswordPlaceholder')"
        />
      </NFormItem>
      <div
        class="mb-16px flex items-start gap-8px rd-10px bg-primary-50 p-12px text-13px text-base-text-2 dark:bg-primary-950"
      >
        <SvgIcon icon="carbon:security" class="mt-1px shrink-0 text-16px text-primary" />
        {{ $t("page.login.resetPassword.sessionsInvalidated") }}
      </div>
      <NButton type="primary" size="large" round block :loading="submitting" @click="handleSubmit">
        {{ $t("page.login.resetPassword.confirm") }}
      </NButton>
    </NForm>
  </div>
</template>
