<script setup lang="ts">
  import { computed } from "vue"
  import type { VNode } from "vue"
  import { useAuthStore } from "@/store/modules/auth"
  import { useRouterPush } from "@/hooks/common/router"
  import { useSvgIcon } from "@/hooks/common/icon"
  import { $t } from "@/locales"

  defineOptions({
    name: "UserMenu",
  })

  const authStore = useAuthStore()
  const { routerPushByKey, toLogin } = useRouterPush()
  const { SvgIconVNode } = useSvgIcon()

  function loginOrRegister() {
    toLogin()
  }

  type DropdownKey = "logout"

  type DropdownOption =
    | {
        key: DropdownKey
        label: string
        icon?: () => VNode
      }
    | {
        type: "divider"
        key: string
      }

  const options = computed(() => {
    const opts: DropdownOption[] = [
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
  <NDropdown v-else placement="bottom" trigger="click" :options="options" @select="handleDropdown">
    <button
      type="button"
      class="h-40px flex-y-center gap-8px border-0 bg-transparent px-8px rd-8px text-[var(--text-color-1)] transition-colors duration-200 cursor-pointer hover:bg-[var(--n-color-modal)]"
    >
      <AppAvatar :name="authStore.userInfo.name" :seed="authStore.userInfo.id" :size="32" />
      <span class="max-w-140px ellipsis-text text-14px font-500">
        {{ authStore.userInfo.name }}
      </span>
      <SvgIcon icon="ph:caret-down" class="text-14px text-[var(--text-color-3)]" aria-hidden="true" />
    </button>
  </NDropdown>
</template>

<style scoped></style>
