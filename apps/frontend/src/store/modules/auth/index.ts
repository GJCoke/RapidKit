import { computed, onScopeDispose, reactive, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { defineStore } from "pinia"
import type { ElegantConstRoute, LastLevelRouteKey, RouteKey } from "@elegant-router/types"
import { useLoading } from "@rapidkit/hooks"
import { rsaEncrypt } from "@rapidkit/utils"
import {
  fetchGetPublicKey,
  fetchGetUserInfo,
  fetchGetUserRoutes,
  fetchLogin,
  fetchCreateImpersonation,
  fetchGetCurrentImpersonation,
  fetchDeleteCurrentImpersonation,
} from "@/service/api"
import { getAuthSession } from "@/service/request/auth-session"
import { useNotificationStore } from "@/store/modules/notification"
import { useBannerStore } from "@/store/modules/banner"
import { useRouterPush } from "@/hooks/common/router"
import { router } from "@/router"
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
import { createImpersonationSession } from "./impersonation-session"
import { installIdentitySync } from "./identity-sync"

export const useAuthStore = defineStore(SetupStoreId.Auth, () => {
  const route = useRoute()
  const routeStore = useRouteStore()
  const tabStore = useTabStore()
  const { toLogin, redirectFromLogin, toHome } = useRouterPush(false)
  const { loading: loginLoading, startLoading, endLoading } = useLoading()

  const token = ref("")

  function createEmptyUserInfo(): Api.Auth.UserInfo {
    return {
      id: "",
      createTime: "",
      updateTime: "",
      name: "",
      email: "",
      username: "",
      isAdmin: false,
      roles: [],
      buttons: [],
      restrictedFields: {},
    }
  }
  const userInfo = reactive(createEmptyUserInfo())
  const impersonation = ref<Api.Impersonation.Snapshot | null>(localStg.get("impersonation"))
  let runtimeVersion = 0
  let clearing: Promise<void> | null = null

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

  function resetIdentityState(): Promise<void> {
    if (clearing) return clearing
    runtimeVersion++
    permissionSync.reset()
    permissionRefresher.reset()
    disconnectNotificationSocket()
    disconnectGlobalSocket()
    useNotificationStore().reset()
    useBannerStore().reset()
    token.value = ""
    Object.assign(userInfo, createEmptyUserInfo())
    localStg.remove("globalTabs")
    tabStore.$reset()
    clearing = routeStore.resetStore().finally(() => {
      clearing = null
    })
    return clearing
  }

  async function loadIdentity(isCurrent: () => boolean = () => true): Promise<boolean> {
    const generation = getAuthSession()
    const version = runtimeVersion
    token.value = getToken()
    try {
      const snapshot = await fetchPermissionSnapshot()
      if (!snapshot || !isCurrent() || version !== runtimeVersion || generation !== getAuthSession()) return false
      await applyPermissionSnapshot(snapshot, false)
      if (!isCurrent() || version !== runtimeVersion || generation !== getAuthSession()) return false
      routeStore.setIsInitAuthRoute(true)
      tabStore.initHomeTab()
      return true
    } catch {
      return false
    }
  }

  function reconnectIdentitySockets() {
    token.value = getToken()
    if (!token.value) return
    connectGlobalSocket()
    connectNotificationSocket(token.value)
  }

  async function navigateIdentity(path: string) {
    if (path === "/") return toHome()
    const destination = router.resolve(path)
    if (!destination.name || destination.name === "not-found" || !router.hasRoute(destination.name)) return toHome()
    return router.replace(path)
  }

  const coordinator = createImpersonationSession({
    create: fetchCreateImpersonation,
    validate: fetchGetCurrentImpersonation,
    stop: fetchDeleteCurrentImpersonation,
    clearRuntime: resetIdentityState,
    loadIdentity,
    navigate: navigateIdentity,
    login: async () => {
      clearAuthStorage()
      impersonation.value = null
      await resetIdentityState()
      await toLogin()
    },
    reconnect: reconnectIdentitySockets,
    changed: (snapshot) => {
      impersonation.value = snapshot
    },
  })

  function startImpersonation(body: Api.Impersonation.CreateBody, returnPath = route.fullPath) {
    return coordinator.enter(body, returnPath)
  }
  const stopImpersonation = coordinator.stop
  const validateImpersonation = coordinator.validate

  /** Reset auth store */
  async function resetStore() {
    coordinator.cancel()
    recordUserId()
    clearAuthStorage()
    impersonation.value = null
    getAuthSession()
    await resetIdentityState()
    if (!route.meta.constant) await toLogin()
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
    if (localStg.get("impersonation")) {
      if (!(await coordinator.validate())) return
    } else if (localStg.get("impersonatorToken")) {
      await coordinator.restore()
      return
    }
    if (!getToken()) return
    if (!(await loadIdentity())) {
      await resetStore()
      return
    }
    reconnectIdentitySockets()
  }

  const now = ref(Date.now())
  const expiresInSeconds = computed(() => {
    if (!impersonation.value) return 0
    const expiry = Date.parse(impersonation.value.expiresAt)
    return Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now.value) / 1000)) : 0
  })
  let expiryTimer: ReturnType<typeof setInterval> | undefined
  function checkExpiry() {
    now.value = Date.now()
    if (impersonation.value && expiresInSeconds.value === 0) void stopImpersonation().catch(() => {})
  }
  const stopExpiryWatch = watch(
    impersonation,
    (snapshot) => {
      clearInterval(expiryTimer)
      now.value = Date.now()
      if (snapshot) expiryTimer = setInterval(checkExpiry, 1000)
    },
    { immediate: true },
  )

  const disposeIdentitySync =
    typeof window !== "undefined"
      ? installIdentitySync(window, import.meta.env.VITE_STORAGE_PREFIX || "", () => window.location.reload())
      : () => {}
  function onVisibility() {
    if (document.visibilityState === "visible") checkExpiry()
  }
  if (typeof window !== "undefined") window.addEventListener("focus", checkExpiry)
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility)
  function disposeIdentityObservers() {
    clearInterval(expiryTimer)
    stopExpiryWatch()
    disposeIdentitySync()
    if (typeof window !== "undefined") window.removeEventListener("focus", checkExpiry)
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility)
  }
  onScopeDispose(disposeIdentityObservers)
  import.meta.hot?.dispose(disposeIdentityObservers)

  return {
    token,
    userInfo,
    isStaticSuper,
    isLogin,
    syncAccessToken,
    loginLoading,
    resetStore,
    resetIdentityState,
    startImpersonation,
    stopImpersonation,
    validateImpersonation,
    impersonation,
    expiresInSeconds,
    login,
    initUserInfo,
    syncPermissions,
  }
})
