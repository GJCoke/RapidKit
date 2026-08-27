<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from "vue"
  import { useRoute } from "vue-router"
  import { rsaEncrypt } from "@rapidkit/utils"
  import { fetchGetPublicKey, fetchSetPassword, fetchValidateInvite } from "@/service/api"
  import { useRouterPush } from "@/hooks/common/router"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "SetPassword" })

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
    const { data, error } = await fetchValidateInvite(token.value)
    tokenValid.value = !error && data?.valid === true
  }

  async function handleSubmit() {
    if (!tokenValid.value) return
    await validate()
    submitting.value = true
    try {
      const { data: publicKey, error: keyError } = await fetchGetPublicKey()
      if (keyError || !publicKey) return
      const newPassword = await rsaEncrypt(publicKey, model.password)
      const { error } = await fetchSetPassword({ token: token.value, newPassword })
      if (error) return
      window.$message?.success($t("page.login.setPassword.success"))
      toggleLoginModule("pwd-login")
    } finally {
      submitting.value = false
    }
  }

  onMounted(checkToken)
</script>

<template>
  <div>
    <NSpin v-if="tokenValid === null" class="w-full" />
    <NAlert v-else-if="tokenValid === false" type="error" :bordered="false" class="mb-16px">
      {{ $t("page.login.setPassword.invalidToken") }}
    </NAlert>
    <NForm
      v-else
      ref="formRef"
      :model="model"
      :rules="rules"
      size="large"
      :show-label="false"
      @keyup.enter="handleSubmit"
    >
      <NFormItem path="password">
        <NInput
          v-model:value="model.password"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.login.common.passwordPlaceholder')"
        />
      </NFormItem>
      <NFormItem path="confirmPassword">
        <NInput
          v-model:value="model.confirmPassword"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.login.common.confirmPasswordPlaceholder')"
        />
      </NFormItem>
      <NSpace vertical :size="18" class="w-full">
        <NButton type="primary" size="large" round block :loading="submitting" @click="handleSubmit">
          {{ $t("common.confirm") }}
        </NButton>
      </NSpace>
    </NForm>
    <NButton v-if="tokenValid === false" size="large" round block @click="toggleLoginModule('pwd-login')">
      {{ $t("page.login.common.back") }}
    </NButton>
  </div>
</template>

<style scoped></style>
