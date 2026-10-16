import { computed, reactive, ref } from "vue"
import { useRoute } from "vue-router"
import { defineStore } from "pinia"
import type { ElegantConstRoute, LastLevelRouteKey, RouteKey } from "@elegant-router/types"
import { useLoading } from "@rapidkit/hooks"
import { rsaEncrypt } from "@rapidkit/utils"
import { fetchGetPublicKey, fetchGetUserInfo, fetchGetUserRoutes, fetchLogin } from "@/service/api"
import { useRouterPush } from "@/hooks/common/router"
import { connectNotificationSocket, disconnectNotificationSocket } from "@/store/modules/notification/shared"
import { localStg } from "@/utils/storage"
import { SetupStoreId } from "@/enum"
import { $t } from "@/locales"
import { useRouteStore } from "../route"
import { useTabStore } from "../tab"
import {
  clearAuthStorage,
  connectGlobalSocket,
  disconnectGlobalSocket,
  getToken,
  setPermissionSignalHandler,
} from "./shared"
import { createPermissionRefresher } from "./permission-refresh"
import { createPermissionSync } from "./permission-sync"
import { getLoginCooldown } from "./login-result"
import type { LoginResult } from "./login-result"

export const useAuthStore = defineStore(SetupStoreId.Auth, () => {
  const route = useRoute()
  const authStore = useAuthStore()
  const routeStore = useRouteStore()
  const tabStore = useTabStore()
  const { toLogin, redirectFromLogin, toHome } = useRouterPush(false)
  const { loading: loginLoading, startLoading, endLoading } = useLoading()

  const token = ref("")

  const userInfo: Api.Auth.UserInfo = reactive({
    id: "",
    createTime: "",
    updateTime: "",
    name: "",
    email: "",
    username: "",
    isAdmin: false,
    roles: [],
    buttons: [],
  })

  /** is super role in static route */
  const isStaticSuper = computed(() => {
    const { VITE_AUTH_ROUTE_MODE, VITE_STATIC_SUPER_ROLE } = import.meta.env

    return VITE_AUTH_ROUTE_MODE === "static" && userInfo.roles.includes(VITE_STATIC_SUPER_ROLE)
  })

  /** Is login */
  const isLogin = computed(() => Boolean(token.value))

  interface PermissionSnapshot {
    info: Api.Auth.UserInfo
    authRoutes: ElegantConstRoute[]
    home: LastLevelRouteKey | null
  }

  /** Fetch the latest user info and routes without applying them */
  async function fetchPermissionSnapshot(): Promise<PermissionSnapshot | null> {
    const isDynamic = import.meta.env.VITE_AUTH_ROUTE_MODE === "dynamic"
    const [infoResult, routesResult] = await Promise.all([
      fetchGetUserInfo(),
      isDynamic ? fetchGetUserRoutes() : Promise.resolve(null),
    ])

    if (infoResult.error || routesResult?.error) return null

    return {
      info: infoResult.data,
      authRoutes: routeStore.resolveAuthRoutes(infoResult.data.roles, routesResult?.data.routes ?? null),
      home: routesResult?.data.home ?? null,
    }
  }

  /** Whether the current route stays accessible under the snapshot */
  function canAccessCurrentRoute(snapshot: PermissionSnapshot) {
    if (route.meta.constant || !route.name) return true

    return routeStore.hasAuthRoute(route.name as RouteKey, snapshot.authRoutes)
  }

  /** Apply the snapshot to user info, routes, menus and tabs */
  async function applyPermissionSnapshot(snapshot: PermissionSnapshot, leave: boolean) {
    Object.assign(userInfo, snapshot.info)
    routeStore.applyAuthRoutes(snapshot.authRoutes, snapshot.home)

    if (leave) await toHome()

    await routeStore.removeInaccessibleTabs()
  }

  /** Ask the user to confirm leaving the current page that is no longer accessible */
  function confirmPermissionLoss(onConfirm: () => void) {
    if (!window.$dialog) {
      onConfirm()
      return
    }

    window.$dialog.warning({
      title: $t("request.permissionChanged"),
      content: $t("request.permissionChangedMsg"),
      positiveText: $t("common.confirm"),
      closable: false,
      maskClosable: false,
      closeOnEsc: false,
      onPositiveClick: onConfirm,
    })
  }

  const permissionRefresher = createPermissionRefresher<PermissionSnapshot>({
    fetchLatest: fetchPermissionSnapshot,
    canAccessCurrent: canAccessCurrentRoute,
    apply: applyPermissionSnapshot,
    confirm: confirmPermissionLoss,
  })

  const permissionSync = createPermissionSync({
    getUser: () => ({ isAdmin: userInfo.isAdmin, roles: userInfo.roles }),
    refresh: permissionRefresher.refresh,
  })

  setPermissionSignalHandler(permissionSync)

  /** Fallback permission refresh (e.g. backend responded 34001), throttled */
  function syncPermissions() {
    if (!token.value) return

    permissionSync.trigger()
  }

  /** Synchronize refreshed credentials with reactive auth state and sockets. */
  function syncAccessToken(accessToken: string) {
    token.value = accessToken
    connectGlobalSocket()
    connectNotificationSocket(accessToken)
  }

  /** Reset auth store */
  async function resetStore() {
    recordUserId()

    permissionSync.reset()
    permissionRefresher.reset()
    disconnectNotificationSocket()
    disconnectGlobalSocket()
    clearAuthStorage()

    authStore.$reset()

    tabStore.cacheTabs()
    await routeStore.resetStore()

    if (!route.meta.constant) {
      await toLogin()
    }
  }

  /** Record the user ID of the previous login session Used to compare with the current user ID on next login */
  function recordUserId() {
    if (!userInfo.id) {
      return
    }

    // Store current user ID locally for next login comparison
    localStg.set("lastLoginUserId", userInfo.id)
  }

  /**
   * Check if current login user is different from previous login user If different, clear all tabs
   *
   * @returns {boolean} Whether to clear all tabs
   */
  function checkTabClear(): boolean {
    if (!userInfo.id) {
      return false
    }

    const lastLoginUserId = localStg.get("lastLoginUserId")

    // Clear all tabs if current user is different from previous user
    if (!lastLoginUserId || lastLoginUserId !== userInfo.id) {
      localStg.remove("globalTabs")
      tabStore.clearTabs()

      localStg.remove("lastLoginUserId")
      return true
    }

    localStg.remove("lastLoginUserId")
    return false
  }

  /**
   * Login
   *
   * @param username User name
   * @param password Password
   * @param [redirect=true] Whether to redirect after login. Default is `true`
   */
  async function login(username: string, password: string, redirect = true): Promise<LoginResult> {
    startLoading()

    const { data: publicKey } = await fetchGetPublicKey()

    const {
      data: loginToken,
      error,
      response,
    } = await fetchLogin({
      username,
      password: await rsaEncrypt(publicKey!, password),
    })

    if (!error) {
      const pass = await loginByToken(loginToken)

      if (pass) {
        // Check if the tab needs to be cleared
        const isClear = checkTabClear()
        let needRedirect = redirect

        if (isClear) {
          // If the tab needs to be cleared,it means we don't need to redirect.
          needRedirect = false
        }
        await redirectFromLogin(needRedirect)

        window.$notification?.success({
          title: $t("page.login.common.loginSuccess"),
          content: $t("page.login.common.welcomeBack", { name: userInfo.name }),
          duration: 4500,
        })
        endLoading()
        return { kind: "success" }
      }
    } else {
      const retryAfterSeconds = getLoginCooldown(response?.data)
      await resetStore()
      endLoading()
      return retryAfterSeconds === null ? { kind: "failure" } : { kind: "cooldown", retryAfterSeconds }
    }

    endLoading()
    return { kind: "failure" }
  }

  async function loginByToken(loginToken: Api.Auth.LoginToken) {
    // 1. stored in the localStorage, the later requests need it in headers
    localStg.set("token", loginToken.accessToken)
    localStg.set("refreshToken", loginToken.refreshToken)

    // 2. get user info
    const pass = await getUserInfo()

    if (pass) {
      token.value = loginToken.accessToken
      connectGlobalSocket()
      connectNotificationSocket(loginToken.accessToken)

      return true
    }

    return false
  }

  async function getUserInfo() {
    const { data: info, error } = await fetchGetUserInfo()

    if (!error) {
      // update store
      Object.assign(userInfo, info)

      return true
    }

    return false
  }

  async function initUserInfo() {
    const maybeToken = getToken()

    if (maybeToken) {
      token.value = maybeToken
      const pass = await getUserInfo()

      if (!pass) {
        resetStore()
      } else {
        connectGlobalSocket()
        connectNotificationSocket(maybeToken)
      }
    }
  }

  return {
    token,
    userInfo,
    isStaticSuper,
    isLogin,
    syncAccessToken,
    loginLoading,
    resetStore,
    login,
    initUserInfo,
    syncPermissions,
  }
})
