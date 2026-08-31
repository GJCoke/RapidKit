<script setup lang="ts">
  import { computed, reactive, ref } from "vue"
  import { useIntervalFn } from "@vueuse/core"
  import { fetchRequestPasswordReset } from "@/service/api"
  import { useRouterPush } from "@/hooks/common/router"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "ResetPwd" })

  const { toggleLoginModule } = useRouterPush()
  const { formRef, validate } = useNaiveForm()
  const model = reactive({ email: "" })
  const loading = ref(false)
  const submitted = ref(false)
  const seconds = ref(0)
  const rules = computed(() => ({ email: useFormRules().formRules.email }))

  const { pause, resume } = useIntervalFn(
    () => {
      seconds.value = Math.max(0, seconds.value - 1)
      if (seconds.value === 0) pause()
    },
    1000,
    { immediate: false },
  )

  async function handleSubmit() {
    if (loading.value || seconds.value > 0) return
    await validate()
    loading.value = true
    const { error } = await fetchRequestPasswordReset({ email: model.email.trim() })
    loading.value = false
    if (!error) {
      submitted.value = true
      seconds.value = 60
      resume()
    }
  }
</script>

<template>
  <div class="flex-col-stretch gap-20px">
    <div class="flex-col-stretch gap-8px">
      <p class="text-13px text-primary font-600 tracking-0.08em uppercase">
        {{ $t("page.login.resetPwd.eyebrow") }}
      </p>
      <p class="text-14px text-[var(--text-color-2)] leading-22px">
        {{ $t("page.login.resetPwd.description") }}
      </p>
    </div>

    <div v-if="submitted" class="flex-col-stretch gap-12px rd-12px bg-primary-50 p-16px dark:bg-primary-950">
      <div class="flex items-start gap-10px">
        <SvgIcon icon="carbon:checkmark-outline" class="mt-2px text-20px text-primary" />
        <p class="text-14px text-[var(--text-color-1)] leading-22px">
          {{ $t("page.login.resetPwd.sent") }}
        </p>
      </div>
    </div>

    <NForm ref="formRef" :model="model" :rules="rules" size="large" :show-label="false" @keyup.enter="handleSubmit">
      <NFormItem path="email">
        <NInput v-model:value="model.email" :placeholder="$t('page.login.resetPwd.emailPlaceholder')">
          <template #prefix><SvgIcon icon="carbon:email" /></template>
        </NInput>
      </NFormItem>
      <NSpace vertical :size="14" class="w-full">
        <NButton type="primary" size="large" round block :loading="loading" :disabled="seconds > 0" @click="handleSubmit">
          {{ seconds > 0 ? $t("page.login.resetPwd.cooldown", { seconds }) : $t("page.login.resetPwd.send") }}
        </NButton>
        <NButton size="large" round block @click="toggleLoginModule('pwd-login')">
          {{ $t("page.login.common.back") }}
        </NButton>
      </NSpace>
    </NForm>
  </div>
</template>
