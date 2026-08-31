<script setup lang="ts">
  import { computed } from "vue"
  import type { Component } from "vue"
  import { getPaletteColorByNumber, mixColor } from "@rapidkit/color"
  import { loginModuleRecord } from "@/constants/app"
  import { useAppStore } from "@/store/modules/app"
  import { useThemeStore } from "@/store/modules/theme"
  import { $t } from "@/locales"
  import { getLoginPresentation } from "./login-presentation"
  import PwdLogin from "./modules/pwd-login.vue"
  import CodeLogin from "./modules/code-login.vue"
  import Register from "./modules/register.vue"
  import ResetPwd from "./modules/reset-pwd.vue"
  import BindWechat from "./modules/bind-wechat.vue"
  import SetPassword from "./modules/set-password.vue"
  import ResetPassword from "./modules/reset-password.vue"

  interface Props {
    /** The login module */
    module?: UnionKey.LoginModule
  }

  const props = defineProps<Props>()

  const appStore = useAppStore()
  const themeStore = useThemeStore()

  interface LoginModule {
    label: I18nFullKey
    component: Component
  }

  const moduleMap: Record<UnionKey.LoginModule, LoginModule> = {
    "pwd-login": { label: loginModuleRecord["pwd-login"], component: PwdLogin },
    "code-login": { label: loginModuleRecord["code-login"], component: CodeLogin },
    register: { label: loginModuleRecord.register, component: Register },
    "reset-pwd": { label: loginModuleRecord["reset-pwd"], component: ResetPwd },
    "bind-wechat": { label: loginModuleRecord["bind-wechat"], component: BindWechat },
    "set-password": { label: loginModuleRecord["set-password"], component: SetPassword },
    "reset-password": { label: loginModuleRecord["reset-password"], component: ResetPassword },
  }

  const activeModule = computed(() => moduleMap[props.module || "pwd-login"])
  const presentation = computed(() => getLoginPresentation(props.module))

  const bgThemeColor = computed(() =>
    themeStore.darkMode ? getPaletteColorByNumber(themeStore.themeColor, 600) : themeStore.themeColor,
  )

  const bgColor = computed(() => {
    const COLOR_WHITE = "#ffffff"

    const ratio = themeStore.darkMode ? 0.5 : 0.2

    return mixColor(COLOR_WHITE, themeStore.themeColor, ratio)
  })
</script>

<template>
  <div
    class="relative size-full flex justify-center overflow-x-hidden overflow-y-auto px-16px py-24px"
    :style="{ backgroundColor: bgColor }"
  >
    <WaveBg :theme-color="bgThemeColor" />
    <NCard
      :bordered="false"
      class="relative z-4 my-auto w-auto rd-12px"
      :class="{ 'activation-card': presentation.mode === 'activation' }"
    >
      <div :class="presentation.mode === 'activation' ? 'w-460px lt-sm:w-300px' : 'w-400px lt-sm:w-300px'">
        <header
          class="flex-y-center justify-between"
          :class="{ 'activation-header': presentation.mode === 'activation' }"
        >
          <SystemLogo
            class="text-primary"
            :class="presentation.mode === 'activation' ? 'size-44px' : 'size-64px lt-sm:size-48px'"
          />
          <h3
            class="text-primary font-500"
            :class="presentation.mode === 'activation' ? 'mr-auto ml-12px text-20px' : 'text-28px lt-sm:text-22px'"
          >
            {{ $t("system.title") }}
          </h3>
          <div class="i-flex-col">
            <ThemeSchemaSwitch
              :theme-schema="themeStore.themeScheme"
              :show-tooltip="false"
              class="text-20px lt-sm:text-18px"
              @switch="themeStore.toggleThemeScheme"
            />
            <LangSwitch
              v-if="themeStore.header.multilingual.visible"
              :lang="appStore.locale"
              :lang-options="appStore.localeOptions"
              :show-tooltip="false"
              @change-lang="appStore.changeLocale"
            />
          </div>
        </header>
        <main :class="presentation.mode === 'activation' ? 'pt-16px' : 'pt-24px'">
          <h3 v-if="presentation.showModuleTitle" class="text-18px text-primary font-medium">
            {{ $t(activeModule.label) }}
          </h3>
          <div :class="{ 'pt-24px': presentation.showModuleTitle }">
            <Transition :name="themeStore.page.animateMode" mode="out-in" appear>
              <component :is="activeModule.component" />
            </Transition>
          </div>
        </main>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
  .activation-card {
    border: 1px solid color-mix(in srgb, var(--primary-color) 14%, transparent);
    box-shadow: 0 24px 64px rgb(15 23 42 / 10%);
  }

  .activation-header {
    padding-bottom: 14px;
    border-bottom: 1px solid var(--n-border-color);
  }
</style>
