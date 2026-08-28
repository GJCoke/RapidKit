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
  <div class="activation-content">
    <div class="activation-intro">
      <div>
        <p class="activation-eyebrow">{{ $t("page.login.setPassword.eyebrow") }}</p>
        <h1 class="activation-title">{{ $t("page.login.setPassword.welcomeTitle") }}</h1>
        <p class="activation-description">{{ $t("page.login.setPassword.description") }}</p>
      </div>
    </div>

    <div v-if="tokenValid === null" class="activation-state">
      <NSpin size="medium" />
      <div>
        <p class="activation-state-title">{{ $t("page.login.setPassword.checkingTitle") }}</p>
        <p class="activation-state-description">{{ $t("page.login.setPassword.checkingDescription") }}</p>
      </div>
    </div>

    <div v-else-if="tokenValid === false" class="activation-state activation-state-error">
      <icon-ph-link-break-bold class="activation-error-icon" aria-hidden="true" />
      <div>
        <p class="activation-state-title">{{ $t("page.login.setPassword.invalidTitle") }}</p>
        <p class="activation-state-description">{{ $t("page.login.setPassword.invalidToken") }}</p>
      </div>
      <NButton size="large" round block @click="toggleLoginModule('pwd-login')">
        {{ $t("page.login.common.back") }}
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
      <NFormItem path="password" :label="$t('page.login.setPassword.passwordLabel')">
        <NInput
          v-model:value="model.password"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.login.common.passwordPlaceholder')"
        />
      </NFormItem>
      <NFormItem path="confirmPassword" :label="$t('page.login.setPassword.confirmPasswordLabel')">
        <NInput
          v-model:value="model.confirmPassword"
          type="password"
          show-password-on="click"
          :placeholder="$t('page.login.common.confirmPasswordPlaceholder')"
        />
      </NFormItem>
      <NSpace vertical :size="18" class="w-full pt-4px">
        <NButton type="primary" size="large" round block :loading="submitting" @click="handleSubmit">
          {{ $t("page.login.setPassword.activate") }}
        </NButton>
      </NSpace>
    </NForm>
  </div>
</template>

<style scoped>
  .activation-content {
    position: relative;
  }

  .activation-intro {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 28px;
  }

  .activation-eyebrow {
    margin: 0 0 6px;
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .activation-title {
    margin: 0;
    color: var(--n-text-color);
    font-size: 24px;
    font-weight: 600;
    line-height: 1.35;
  }

  .activation-description,
  .activation-state-description {
    margin: 6px 0 0;
    color: var(--n-text-color-3);
    line-height: 1.6;
  }

  .activation-state {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;
    align-items: center;
    padding: 18px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  }

  .activation-state-error {
    grid-template-columns: auto 1fr;
  }

  .activation-state-error :deep(.n-button) {
    grid-column: 1 / -1;
    margin-top: 6px;
  }

  .activation-error-icon {
    color: var(--error-color);
    font-size: 28px;
  }

  .activation-state-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  @media (width <= 640px) {
    .activation-title {
      font-size: 21px;
    }
  }
</style>
