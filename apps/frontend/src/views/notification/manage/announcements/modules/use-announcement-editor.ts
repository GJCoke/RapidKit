import { computed, ref, watch } from "vue"
import type { Ref } from "vue"
import { useDebounceFn } from "@vueuse/core"
import dayjs from "dayjs"
import { useAuth } from "@/hooks/business/auth"
import {
  fetchCheckBanner,
  fetchCreateAnnouncement,
  fetchGetAnnouncement,
  fetchGetNotificationTemplates,
  fetchPreviewUnsavedAudience,
  fetchPublishAnnouncement,
  fetchUpdateAnnouncement,
} from "@/service/api"
import { $t } from "@/locales"
import { restoreLocalizedEditor } from "./localized-editor"
import { restoreAnnouncementAction } from "./announcement-action"
import {
  AnnouncementValidationError,
  buildAnnouncementPayload,
  createAnnouncementState,
  createAnnouncementRequestId,
  normalizeAudience,
  templateValueRows,
} from "./announcement-editor"

export function useAnnouncementEditor(
  visible: Ref<boolean>,
  messageId: Ref<string | null | undefined>,
  submitted: () => void,
  copyFromId?: Ref<string | null | undefined>,
) {
  const { hasAuth } = useAuth()
  const t = (key: string, params: Record<string, unknown> = {}) =>
    $t(`page.notification.manage.announcements.editor.${key}` as I18nFullKey, params)
  const state = ref(createAnnouncementState())
  const loading = ref(false)
  const loadFailed = ref(false)
  const submitting = ref(false)
  const previewing = ref(false)
  const previewTotal = ref<number | null>(null)
  const previewError = ref("")
  const formError = ref("")
  const savedId = ref<string | null>(null)
  const savedStatus = ref("unsaved")
  const templates = ref<Api.Notification.Template[]>([])
  const selectedTemplate = ref<Api.Notification.Template | null>(null)
  const templatesLoading = ref(false)
  const templateError = ref("")
  const confirming = ref(false)
  const bannerCheck = ref<Api.Notification.BannerCheck | null>(null)
  const checkingBanner = ref(false)
  const registeredBanner = computed(() => state.value.displayMode === "top_banner" && savedStatus.value === "scheduled")
  const isBanner = computed(() => state.value.displayMode === "top_banner")
  const pendingPayload = ref<Api.Notification.AnnouncementUpdate | null>(null)
  let publishFingerprint = ""
  let publishNonce = ""
  let epoch = 0
  let templateRequest = 0
  let pendingTemplateValues: Record<string, unknown> | null = null
  let pendingTemplateBindings: NonNullable<Api.Notification.AnnouncementUpdate["variableBindings"]> = {}
  const canSave = computed(() =>
    hasAuth(savedId.value ? "PUT:/api/v1/admin/notifications/{message_id}" : "POST:/api/v1/admin/notifications"),
  )
  const canPublish = computed(() => canSave.value && hasAuth("POST:/api/v1/admin/notifications/{message_id}/publish"))
  const canPreview = computed(() => hasAuth("POST:/api/v1/admin/notifications/audience-preview"))
  const canReadTemplates = computed(() => hasAuth("GET:/api/v1/admin/notification-templates"))
  const disabled = computed(
    () => loading.value || loadFailed.value || submitting.value || confirming.value || checkingBanner.value,
  )
  const audienceFingerprint = computed(() => JSON.stringify([state.value.audienceMode, state.value.audiences]))
  const templateOptions = computed(() => {
    const rows = [...templates.value]
    if (selectedTemplate.value && !rows.some((row) => row.code === selectedTemplate.value!.code))
      rows.unshift(selectedTemplate.value)
    return rows.map((row) => ({ label: `${row.name} · ${row.code}`, value: row.code, disabled: !row.enabled }))
  })
  const audienceSummary = computed(() =>
    isBanner.value || state.value.audienceMode === "all"
      ? t("allUsers")
      : t("selectedAudience", { count: state.value.audiences.length }),
  )
  const deliverySummary = computed(() =>
    state.value.delivery === "now"
      ? isBanner.value
        ? $t("page.notification.banner.now" as I18nFullKey)
        : t("now")
      : state.value.model.publishAt
        ? dayjs(state.value.model.publishAt).format("YYYY-MM-DD HH:mm")
        : t("scheduleUnset"),
  )

  function showError(error: unknown) {
    formError.value = error instanceof AnnouncementValidationError ? t(error.key, error.params) : t("requestFailed")
  }
  async function loadTemplates(keyword = "") {
    if (!canReadTemplates.value) return
    const request = ++templateRequest
    const session = epoch
    templatesLoading.value = true
    templateError.value = ""
    try {
      const { data, error } = await fetchGetNotificationTemplates({
        page: 1,
        pageSize: 100,
        keyword: keyword || undefined,
        enabled: true,
      })
      if (session !== epoch || request !== templateRequest) return
      if (error || !data) {
        templateError.value = t("templatesFailed")
        return
      }
      templates.value = data.records
      if (!selectedTemplate.value && state.value.model.templateCode) {
        selectedTemplate.value = data.records.find((row) => row.code === state.value.model.templateCode) ?? null
        if (selectedTemplate.value && pendingTemplateValues !== null) {
          state.value.variableRows = templateValueRows(
            selectedTemplate.value.variableSchema,
            pendingTemplateValues,
            pendingTemplateBindings,
          )
          pendingTemplateValues = null
          pendingTemplateBindings = {}
        }
      }
    } finally {
      if (session === epoch && request === templateRequest) templatesLoading.value = false
    }
  }
  const searchTemplates = useDebounceFn((keyword: string) => {
    if (visible.value && state.value.contentMode === "template") void loadTemplates(keyword)
  }, 250)
  function selectTemplate(code: string | null) {
    pendingTemplateValues = null
    pendingTemplateBindings = {}
    state.value.model.templateCode = code
    const template =
      templates.value.find((row) => row.code === code) ??
      (selectedTemplate.value?.code === code ? selectedTemplate.value : null)
    selectedTemplate.value = template
    state.value.variableRows = template ? templateValueRows(template.variableSchema) : []
    if (!template) return
    state.value.model.category = template.category
    state.value.model.level = template.level
    state.value.model.mandatory = template.mandatory
    restoreAnnouncementAction(state.value, template.defaultAction)
  }
  function payload(intent: "draft" | "publish") {
    if (state.value.contentMode === "template" && (!selectedTemplate.value || !selectedTemplate.value.enabled)) {
      throw new AnnouncementValidationError("templateRequired")
    }
    return buildAnnouncementPayload(state.value, intent)
  }
  async function persist(body: Api.Notification.AnnouncementUpdate) {
    if (savedId.value) {
      const { error } = await fetchUpdateAnnouncement(savedId.value, body)
      if (error) return false
    } else {
      const { data, error } = await fetchCreateAnnouncement(body)
      if (error || !data) return false
      savedId.value = data.messageId
    }
    savedStatus.value = body.saveAsDraft
      ? "draft"
      : body.publishAt
        ? "scheduled"
        : body.displayMode === "top_banner"
          ? "published"
          : "draft"
    submitted()
    return true
  }
  async function saveDraft() {
    if (disabled.value || !canSave.value || registeredBanner.value) return
    submitting.value = true
    formError.value = ""
    try {
      if (!(await persist(payload("draft")))) {
        formError.value = t("requestFailed")
        return
      }
      window.$message?.success(t("draftSaved"))
    } catch (error) {
      showError(error)
    } finally {
      submitting.value = false
    }
  }
  async function previewAudience() {
    if (disabled.value || previewing.value || !canPreview.value) return
    const session = epoch
    const fingerprint = audienceFingerprint.value
    previewError.value = ""
    previewTotal.value = null
    try {
      const audience = normalizeAudience(state.value.audienceMode, state.value.audiences)
      previewing.value = true
      const { data, error } = await fetchPreviewUnsavedAudience({ audience })
      if (session !== epoch || fingerprint !== audienceFingerprint.value) return
      if (error || !data) previewError.value = t("previewFailed")
      else previewTotal.value = data.total
    } catch (error) {
      if (session === epoch)
        previewError.value =
          error instanceof AnnouncementValidationError ? t(error.key, error.params) : t("previewFailed")
    } finally {
      if (session === epoch) previewing.value = false
    }
  }
  async function checkBanner(body?: Api.Notification.AnnouncementUpdate) {
    const session = epoch
    const { data, error } = await fetchCheckBanner({
      publishAt: body?.publishAt,
      expireAt: body?.expireAt,
      messageId: savedId.value,
    })
    if (session !== epoch) return false
    if (error || !data) {
      formError.value = t("bannerCheckFailed")
      return false
    }
    bannerCheck.value = data
    return true
  }
  async function preparePublish() {
    if (disabled.value || !canPublish.value) return
    formError.value = ""
    try {
      pendingPayload.value = payload("publish")
      if (isBanner.value) {
        checkingBanner.value = true
        if (!(await checkBanner(pendingPayload.value))) return
      }
      if (visible.value) confirming.value = true
    } catch (error) {
      showError(error)
    } finally {
      checkingBanner.value = false
    }
  }
  async function confirmPublish() {
    if (submitting.value || !pendingPayload.value || !canPublish.value) return false
    submitting.value = true
    formError.value = ""
    try {
      pendingPayload.value = payload("publish")
      if (isBanner.value) {
        if (!bannerCheck.value) return false
        if (!savedId.value) {
          const fingerprint = JSON.stringify(pendingPayload.value)
          if (fingerprint !== publishFingerprint) {
            publishFingerprint = fingerprint
            publishNonce = createAnnouncementRequestId()
          }
          pendingPayload.value.clientRequestId = publishNonce
        }
        pendingPayload.value = {
          ...pendingPayload.value,
          bannerRevision: bannerCheck.value.revision,
          replaceCurrent: Boolean(bannerCheck.value.current),
          replaceScheduled:
            state.value.delivery === "scheduled" &&
            Boolean(bannerCheck.value.scheduled && bannerCheck.value.scheduled.id !== savedId.value),
          saveAsDraft: false,
        }
      }
      if (!(await persist(pendingPayload.value))) {
        formError.value = t(isBanner.value ? "bannerPublishFailed" : "requestFailed")
        if (isBanner.value) {
          confirming.value = false
          bannerCheck.value = null
          await checkBanner(pendingPayload.value)
          formError.value = t("bannerPublishFailed")
        }
        return false
      }
      if (!isBanner.value && !pendingPayload.value.publishAt) {
        const { error } = await fetchPublishAnnouncement(savedId.value!)
        if (error) {
          formError.value = t("publishFailed")
          return false
        }
        submitted()
      }
      window.$message?.success(t(pendingPayload.value.publishAt ? "scheduled" : "published"))
      confirming.value = false
      visible.value = false
      return true
    } catch (error) {
      showError(error)
      return false
    } finally {
      submitting.value = false
    }
  }
  async function initialize() {
    const session = ++epoch
    state.value = createAnnouncementState()
    formError.value = ""
    loadFailed.value = false
    previewError.value = ""
    previewTotal.value = null
    previewing.value = false
    confirming.value = false
    pendingPayload.value = null
    bannerCheck.value = null
    checkingBanner.value = false
    publishFingerprint = ""
    publishNonce = ""
    savedId.value = messageId.value ?? null
    savedStatus.value = savedId.value ? "draft" : "unsaved"
    selectedTemplate.value = null
    pendingTemplateValues = null
    pendingTemplateBindings = {}
    templates.value = []
    templatesLoading.value = false
    templateError.value = ""
    const sourceId = messageId.value ?? copyFromId?.value
    const copying = Boolean(copyFromId?.value && !messageId.value)
    loading.value = Boolean(sourceId)
    if (!sourceId) return
    try {
      const { data, error } = await fetchGetAnnouncement(sourceId)
      if (session !== epoch) return
      if (error || !data) {
        loadFailed.value = true
        formError.value = t("loadFailed")
        return
      }
      savedStatus.value = copying ? "unsaved" : data.status
      const next = createAnnouncementState()
      next.displayMode = data.displayMode ?? "inbox"
      next.contentMode = data.templateCode
        ? "template"
        : data.contentMode === "local"
          ? "local"
          : data.contentMode === "i18n"
            ? "i18n"
            : "raw"
      if (next.contentMode === "local") next.localized = restoreLocalizedEditor(data.contentParams)
      next.audienceMode = data.audiences.some((rule) => rule.type === "all") ? "all" : "selected"
      next.audiences = next.audienceMode === "selected" ? data.audiences : next.audiences
      next.delivery = data.publishAt ? "scheduled" : "now"
      next.expires = Boolean(data.expireAt)
      next.actionEnabled = Boolean(data.action)
      next.actionParams = JSON.stringify(data.action?.params ?? {}, null, 2)
      next.i18nParams = JSON.stringify(data.contentParams ?? {}, null, 2)
      next.model = {
        category: data.category,
        level: data.level,
        rawTitle: data.title,
        rawContent: data.content,
        rawFormat: data.contentFormat ?? "plain_text",
        templateCode: data.templateCode ?? null,
        i18NKey: next.contentMode === "i18n" ? data.title : "",
        mandatory: data.mandatory,
        publishAt: data.publishAt ? dayjs(data.publishAt).format("YYYY-MM-DDTHH:mm:ss") : null,
        expireAt: data.expireAt ? dayjs(data.expireAt).format("YYYY-MM-DDTHH:mm:ss") : null,
        actionRoute: typeof data.action?.route === "string" ? data.action.route : "notification_center",
        actionLabel: typeof data.action?.label === "string" ? data.action.label : "",
      }
      if (copying) {
        next.delivery = "now"
        next.expires = false
        next.model.publishAt = null
        next.model.expireAt = null
      }
      restoreAnnouncementAction(next, data.action)
      state.value = next
      if (next.contentMode === "template") {
        pendingTemplateValues = data.contentParams ?? {}
        pendingTemplateBindings = data.variableBindings ?? {}
        await loadTemplates(next.model.templateCode ?? "")
      }
    } finally {
      if (session === epoch) loading.value = false
    }
  }
  watch(
    visible,
    (shown) => {
      if (shown) void initialize()
      else {
        epoch++
        confirming.value = false
      }
    },
    { immediate: true },
  )
  watch(
    () => state.value.contentMode,
    (mode) => {
      if (mode === "template" && !loading.value && !templates.value.length) void loadTemplates()
    },
  )
  watch(audienceFingerprint, () => {
    previewTotal.value = null
    previewError.value = ""
  })
  return {
    state,
    bannerCheck,
    checkingBanner,
    registeredBanner,
    isBanner,
    t,
    loading,
    loadFailed,
    submitting,
    previewing,
    previewTotal,
    previewError,
    formError,
    savedStatus,
    disabled,
    canSave,
    canPublish,
    canPreview,
    canReadTemplates,
    templateOptions,
    selectedTemplate,
    templatesLoading,
    templateError,
    confirming,
    audienceSummary,
    deliverySummary,
    loadTemplates,
    searchTemplates,
    selectTemplate,
    saveDraft,
    previewAudience,
    preparePublish,
    confirmPublish,
    initialize,
  }
}
