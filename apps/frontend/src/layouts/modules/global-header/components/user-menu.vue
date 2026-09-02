<script setup lang="ts">
  import { computed, h, ref } from "vue"
  import type { DropdownDividerOption, DropdownOption, DropdownRenderOption } from "naive-ui"
  import { useAuthStore } from "@/store/modules/auth"
  import { useRouterPush } from "@/hooks/common/router"
  import { useSvgIcon } from "@/hooks/common/icon"
  import { $t } from "@/locales"
  import AppAvatar from "@/components/common/app-avatar.vue"

  defineOptions({
    name: "UserMenu",
  })

  const authStore = useAuthStore()
  const { routerPushByKey, toLogin } = useRouterPush()
  const { SvgIconVNode } = useSvgIcon()
  const menuVisible = ref(false)

  const userMenuLabel = computed(() => `${$t("common.userCenter")}: ${authStore.userInfo.name}`)

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
              h(
                "div",
                { class: "truncate text-14px text-base-text-1 font-600 leading-20px" },
                authStore.userInfo.name,
              ),
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
      {
        label: $t("common.logout"),
        key: "logout",
        icon: SvgIconVNode({ icon: "ph:sign-out", fontSize: 18 }),
      },
    ]

    return opts
  })

  function logout() {
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
  <NDropdown
    v-else
    v-model:show="menuVisible"
    placement="bottom-end"
    trigger="click"
    :options="options"
    @select="handleDropdown"
  >
    <button
      type="button"
      class="h-40px w-40px flex-center border-0 bg-transparent p-0 rd-10px transition-colors duration-200 cursor-pointer hover:bg-theme-modal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-primary"
      :class="{ 'bg-theme-modal': menuVisible }"
      :aria-label="userMenuLabel"
      aria-haspopup="menu"
      :aria-expanded="menuVisible"
    >
      <AppAvatar :name="authStore.userInfo.name" :seed="authStore.userInfo.id" :size="32" />
    </button>
  </NDropdown>
</template>

<style scoped></style>
