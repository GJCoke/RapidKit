<script setup lang="ts">
  import { computed, reactive } from "vue"
  import { useCountDown } from "@rapidkit/hooks"
  import { loginModuleRecord } from "@/constants/app"
  import { useAuthStore } from "@/store/modules/auth"
  import { useRouterPush } from "@/hooks/common/router"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { formatCooldown } from "./login-cooldown"

  defineOptions({
    name: "PwdLogin",
  })

  const authStore = useAuthStore()
  const { toggleLoginModule } = useRouterPush()
  const { formRef, validate } = useNaiveForm()
  const { count: cooldownSeconds, isCounting: isCoolingDown, start: startCooldown } = useCountDown(0)
  const cooldownText = computed(() => formatCooldown(cooldownSeconds.value))

  interface FormModel {
    username: string
    password: string
  }

  const model: FormModel = reactive({
    username: "admin",
    password: "123456",
  })

  const rules = computed<Record<keyof FormModel, App.Global.FormRule[]>>(() => {
    // inside computed to make locale reactive, if not apply i18n, you can define it without computed
    const { formRules } = useFormRules()

    return {
      username: formRules.username,
      password: formRules.pwd,
    }
  })

  async function handleSubmit() {
    if (isCoolingDown.value) return
    await validate()
    const result = await authStore.login(model.username, model.password)
    if (result.kind === "cooldown") startCooldown(result.retryAfterSeconds)
  }
</script>

<template>
  <NForm ref="formRef" :model="model" :rules="rules" size="large" :show-label="false" @keyup.enter="handleSubmit">
    <NFormItem path="username">
      <NInput v-model:value="model.username" :placeholder="$t('page.login.common.userNamePlaceholder')" />
    </NFormItem>
    <NFormItem path="password">
      <NInput
        v-model:value="model.password"
        type="password"
        show-password-on="click"
        :placeholder="$t('page.login.common.passwordPlaceholder')"
      />
    </NFormItem>
    <NAlert v-if="isCoolingDown" type="warning" :bordered="false" class="mb-16px">
      {{ $t("page.login.pwdLogin.cooldown", { time: cooldownText }) }}
    </NAlert>
    <NSpace vertical :size="24">
      <div class="flex-y-center justify-between">
        <NCheckbox>{{ $t("page.login.pwdLogin.rememberMe") }}</NCheckbox>
        <NButton quaternary @click="toggleLoginModule('reset-pwd')">
          {{ $t("page.login.pwdLogin.forgetPassword") }}
        </NButton>
      </div>
      <NButton
        type="primary"
        size="large"
        round
        block
        :loading="authStore.loginLoading"
        :disabled="isCoolingDown"
        @click="handleSubmit"
      >
        {{ $t("common.confirm") }}
      </NButton>
    </NSpace>
  </NForm>
</template>

<style scoped></style>
