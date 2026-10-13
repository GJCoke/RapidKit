import { computed, ref, watch } from "vue"
import type { Ref } from "vue"
import { useAuth } from "@/hooks/business/auth"
import { fetchGetAllUsers, fetchPreviewAnnouncementContent } from "@/service/api"
import { $t } from "@/locales"
import {
  announcementTemplateParameters,
  AnnouncementValidationError,
  normalizeAudience,
  recipientFields,
} from "./announcement-editor"
import type { AnnouncementState } from "./announcement-editor"

/** Read-only recipient preview; no save/publish dependency. */
export function useAnnouncementContentPreview(
  state: Ref<AnnouncementState>,
  template: Ref<Api.Notification.Template | null>,
  disabled: Ref<boolean>,
  visible: Ref<boolean>,
) {
  const { hasAuth } = useAuth()
  const t = (key: string, params: Record<string, unknown> = {}) =>
    $t(`page.notification.manage.announcements.editor.${key}` as I18nFullKey, params)
  const previewUserId = ref<string | null>(null)
  const userOptions = ref<{ label: string; value: string }[]>([])
  const usersLoading = ref(false)
  const usersFailed = ref(false)
  const contentLoading = ref(false)
  const contentError = ref("")
  const contentStale = ref(false)
  const renderedContent = ref<Api.Notification.ContentPreview | null>(null)
  let usersLoaded = false
  let requestId = 0
  let session = 0
  const hasDynamicValues = computed(
    () => state.value.contentMode === "template" && state.value.variableRows.some((row) => row.source !== "manual"),
  )
  const canReadUsers = computed(() => hasAuth("GET:/api/v1/users/all"))
  const canPreviewContent = computed(
    () => hasAuth("POST:/api/v1/admin/notifications/content-preview") && canReadUsers.value,
  )
  const contentFingerprint = computed(() =>
    JSON.stringify([
      state.value.contentMode,
      state.value.model.templateCode,
      state.value.variableRows,
      previewUserId.value,
      template.value?.version,
    ]),
  )
  const audienceFingerprint = computed(() => JSON.stringify([state.value.audienceMode, state.value.audiences]))
  const fingerprint = computed(() => JSON.stringify([contentFingerprint.value, audienceFingerprint.value]))
  function previewFailure(error: unknown) {
    const payload = (error as { response?: { data?: { code?: unknown; data?: { variableErrors?: unknown } } } } | null)
      ?.response?.data
    const issues = payload?.data?.variableErrors
    if (String(payload?.code) !== "92012" || !Array.isArray(issues)) return t("contentPreviewFailed")
    const fields = issues.flatMap((issue: unknown) => {
      if (!issue || typeof issue !== "object") return []
      const detail = issue as Record<string, unknown>
      if (
        detail.source !== "recipient" ||
        detail.reason !== "required_value_missing" ||
        typeof detail.name !== "string" ||
        !recipientFields.some((field) => field === detail.field)
      )
        return []
      return [`${detail.name}（${t(`valueSources.${detail.field}`)}）`]
    })
    return fields.length
      ? t("recipientFieldsMissing", { variables: [...new Set(fields)].join("、") })
      : t("contentPreviewFailed")
  }
  function invalidate() {
    requestId++
    renderedContent.value = null
    contentError.value = ""
    contentStale.value = false
    contentLoading.value = false
  }
  async function loadPreviewUsers() {
    if (!canReadUsers.value || usersLoading.value || usersLoaded) return
    const current = session
    usersLoading.value = true
    usersFailed.value = false
    try {
      const { data, error } = await fetchGetAllUsers()
      if (current !== session) return
      if (error || !data) usersFailed.value = true
      else {
        userOptions.value = data.map((user) => ({ label: `${user.name} · ${user.username}`, value: user.id }))
        usersLoaded = true
      }
    } finally {
      if (current === session) usersLoading.value = false
    }
  }
  async function previewContent() {
    if (disabled.value || contentLoading.value || !visible.value || !canPreviewContent.value) return
    const current = ++requestId
    const input = fingerprint.value
    renderedContent.value = null
    contentError.value = ""
    contentStale.value = false
    try {
      if (!state.value.model.templateCode || !template.value?.enabled)
        throw new AnnouncementValidationError("templateRequired")
      if (hasDynamicValues.value && !previewUserId.value) throw new AnnouncementValidationError("previewUserRequired")
      const body: Api.Notification.ContentPreviewBody = {
        templateCode: state.value.model.templateCode,
        ...announcementTemplateParameters(state.value.variableRows),
        audience: normalizeAudience(state.value.audienceMode, state.value.audiences),
        previewUserId: previewUserId.value,
      }
      contentLoading.value = true
      const { data, error } = await fetchPreviewAnnouncementContent(body)
      if (current !== requestId || input !== fingerprint.value || !visible.value) return
      if (error || !data) contentError.value = previewFailure(error)
      else renderedContent.value = data
    } catch (error) {
      if (current === requestId)
        contentError.value =
          error instanceof AnnouncementValidationError ? t(error.key, error.params) : t("contentPreviewFailed")
    } finally {
      if (current === requestId) contentLoading.value = false
    }
  }
  watch(contentFingerprint, invalidate, { flush: "sync" })
  watch(
    audienceFingerprint,
    () => {
      // Keep the last result visible, but never accept a reply for the previous audience.
      requestId++
      contentLoading.value = false
      contentStale.value = Boolean(renderedContent.value || contentError.value)
    },
    { flush: "sync" },
  )
  watch(visible, (shown) => {
    session++
    invalidate()
    previewUserId.value = null
    userOptions.value = []
    usersLoaded = false
    usersLoading.value = false
    usersFailed.value = false
    if (shown && hasDynamicValues.value) void loadPreviewUsers()
  })
  watch(
    hasDynamicValues,
    (dynamic) => {
      if (dynamic && visible.value) void loadPreviewUsers()
    },
    { immediate: true },
  )
  return {
    hasDynamicValues,
    canReadUsers,
    canPreviewContent,
    previewUserId,
    userOptions,
    usersLoading,
    usersFailed,
    contentLoading,
    contentError,
    contentStale,
    renderedContent,
    loadPreviewUsers,
    previewContent,
  }
}
