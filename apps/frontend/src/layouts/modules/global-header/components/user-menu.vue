<script setup lang="ts">
  import { computed, h, ref } from "vue"
  import { useThemeVars } from "naive-ui"
  import type { DropdownDividerOption, DropdownOption, DropdownRenderOption } from "naive-ui"
  import { useAuthStore } from "@/store/modules/auth"
  import { useRouterPush } from "@/hooks/common/router"
  import { useSvgIcon } from "@/hooks/common/icon"
  import { $t } from "@/locales"
  import AppAvatar from "@/components/common/app-avatar.vue"
  import ImpersonationInfo from "./impersonation-info.vue"

  defineOptions({
    name: "UserMenu",
  })

  const authStore = useAuthStore()
  const theme = useThemeVars()
  const { routerPushByKey, toLogin } = useRouterPush()
  const { SvgIconVNode } = useSvgIcon()
  const menuVisible = ref(false)
  const stopping = ref(false)

  const userMenuLabel = computed(() => `${$t("common.userCenter")}: ${authStore.userInfo.name}`)
  const capsuleStyle = computed(() =>
    authStore.impersonation ? { "--fill-color": theme.value.hoverColor } : undefined,
  )

  function loginOrRegister() {
    toLogin()
  }

  type DropdownKey = "logout"
  type UserDropdownOption = DropdownOption | DropdownDividerOption | DropdownRenderOption

  const options = computed(() => {
    const opts: UserDropdownOption[] = [
      {
        type: "render",
        key: "identity",
        render: () =>
          h("div", { class: "w-220px flex items-center gap-12px px-14px py-10px" }, [
            h(AppAvatar, {
              name: authStore.userInfo.name,
              seed: authStore.userInfo.id,
              size: 40,
            }),
            h("div", { class: "min-w-0 flex-1" }, [
              h("div", { class: "truncate text-14px text-base-text-1 font-600 leading-20px" }, authStore.userInfo.name),
              h(
                "div",
                { class: "mt-2px truncate text-12px text-base-text-3 leading-18px" },
                authStore.userInfo.email || authStore.userInfo.username,
              ),
            ]),
          ]),
      },
      {
        type: "divider",
        key: "identity-divider",
      },
    ]
    const snapshot = authStore.impersonation
    if (snapshot) {
      opts.push({
        type: "render",
        key: "impersonation-info",
        render: () =>
          h(ImpersonationInfo, {
            snapshot,
            seconds: authStore.expiresInSeconds,
          }),
      })
    } else {
      opts.push({
        label: $t("common.logout"),
        key: "logout",
        icon: SvgIconVNode({ icon: "ph:sign-out", fontSize: 18 }),
      })
    }

    return opts
  })

  async function stopImpersonation() {
    if (stopping.value) return
    stopping.value = true
    menuVisible.value = false
    try {
      await authStore.stopImpersonation()
    } finally {
      stopping.value = false
    }
  }

  function logout() {
    if (authStore.impersonation) {
      window.$message?.warning($t("request.impersonationStopFirst"))
      return
    }
    window.$dialog?.info({
      title: $t("common.tip"),
      content: $t("common.logoutConfirm"),
      positiveText: $t("common.confirm"),
      negativeText: $t("common.cancel"),
      onPositiveClick: () => {
        authStore.resetStore()
      },
    })
  }

  function handleDropdown(key: DropdownKey) {
    if (key === "logout") {
      logout()
    } else {
      routerPushByKey(key)
    }
  }
</script>

<template>
  <NButton v-if="!authStore.isLogin" quaternary @click="loginOrRegister">
    {{ $t("page.login.common.loginOrRegister") }}
  </NButton>
  <div
    v-else
    class="flex items-center"
    :class="{ 'bg-theme-fill rd-full pl-4px': authStore.impersonation }"
    :style="capsuleStyle"
  >
    <NTooltip v-if="authStore.impersonation" placement="bottom">
      <template #trigger>
        <button
          type="button"
          class="h-40px w-36px flex-center border-0 bg-transparent p-0 rd-full text-base-text-1 cursor-pointer transition-colors hover:bg-theme-modal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-primary disabled:cursor-wait"
          :aria-label="$t('page.manage.user.impersonation.stop')"
          :aria-busy="stopping"
          :disabled="stopping"
          @click="stopImpersonation"
        >
          <SvgIcon v-if="stopping" icon="ph:spinner-gap" class="animate-spin text-20px" aria-hidden="true" />
          <SvgIcon v-else local-icon="incognito" class="text-20px" aria-hidden="true" />
        </button>
      </template>
      {{ $t("page.manage.user.impersonation.stop") }}
    </NTooltip>
    <NDropdown
      v-model:show="menuVisible"
      placement="bottom-end"
      trigger="click"
      :options="options"
      @select="handleDropdown"
    >
      <button
        type="button"
        class="h-40px w-40px flex-center border-0 bg-transparent p-0 transition-colors duration-200 cursor-pointer hover:bg-theme-modal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-primary"
        :style="{ borderRadius: authStore.impersonation ? '9999px' : '10px' }"
        :class="{ 'bg-theme-modal': menuVisible }"
        :aria-label="userMenuLabel"
        aria-haspopup="menu"
        :aria-expanded="menuVisible"
      >
        <AppAvatar :name="authStore.userInfo.name" :seed="authStore.userInfo.id" :size="32" />
      </button>
    </NDropdown>
  </div>
</template>

<style scoped></style>
