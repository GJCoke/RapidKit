import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { checkAnnouncementBanner, type AnnouncementBannerCheck } from "@/services/api/announcement"
import type { NotificationTemplate } from "@/services/api/notification-template"
import {
  announcementData,
  requireAnnouncementPermission,
  useAnnouncementActionTargets,
  useAnnouncementDetail,
  useAnnouncementTemplates,
  useAnnouncementWrites,
} from "@/services/hooks/use-announcements"
import {
  AnnouncementValidationError,
  bannerPublication,
  buildAnnouncementPayload,
  emptyAnnouncementForm,
  restoredAnnouncementAction,
  restoreAnnouncementForm,
  templateVariables,
  type AnnouncementForm,
} from "./announcement-model"

function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const text = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`
}
export function useAnnouncementEditor({
  messageId,
  copyFromId,
  onClose,
}: {
  messageId?: string | null
  copyFromId?: string | null
  onClose: () => void
}) {
  const { t } = useTranslation(),
    session = useRef(getAuthSession()).current,
    liveSession = getAuthSession()
  const sourceId = messageId || copyFromId || null
  const form = useForm<AnnouncementForm>({ defaultValues: emptyAnnouncementForm() })
  const values = form.watch()
  const detail = useAnnouncementDetail(sourceId)
  const writes = useAnnouncementWrites()
  const [initialized, setInitialized] = useState(!sourceId)
  const [savedId, setSavedId] = useState(messageId || null),
    id = useRef(messageId || null)
  const [savedStatus, setSavedStatus] = useState("unsaved")
  const [processing, setProcessing] = useState(false),
    [preparing, setPreparing] = useState(false)
  const [confirmation, setConfirmation] = useState<{ check: AnnouncementBannerCheck | null } | null>(null)
  const [templateKeyword, setTemplateKeyword] = useState("")
  const templateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null)
  const templates = useAnnouncementTemplates(templateKeyword, initialized && values.contentSource === "template")
  const actionTargets = useAnnouncementActionTargets(values.action.type === "menu")
  const actionTarget = actionTargets.isError
    ? null
    : (actionTargets.data?.find((row) => row.menuId === values.action.menuId) ?? null)
  const pendingTemplate = useRef<{
    code: string
    values: Record<string, unknown>
    bindings: NonNullable<Parameters<typeof templateVariables>[2]>
  } | null>(null)
  const bannerRequest = useRef(0)
  const alive = useRef(true),
    lock = useRef(false),
    nonce = useRef({ fingerprint: "", value: "" })
  const canCreate = usePermission("notification:create"),
    canUpdate = usePermission("notification:update"),
    mayPublish = usePermission("notification:publish"),
    canPreview = usePermission("notification:preview")
  const canSave = savedId ? canUpdate : canCreate,
    canPublish = canSave && mayPublish
  const current = () => alive.current && session === getAuthSession()
  const error = form.formState.errors.root?.message ?? ""
  const showError = (error: unknown, fallback = "requestFailed") => {
    if (current())
      form.setError("root", {
        message:
          error instanceof AnnouncementValidationError
            ? t(`announcement.editor.${error.key}`, error.params)
            : t(`announcement.editor.${fallback}`),
      })
  }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(templateTimer.current)
    }
  }, [])
  useEffect(() => {
    if (!canSave || liveSession !== session) onClose()
  }, [canSave, liveSession, session, onClose])
  useEffect(() => {
    if (!canPublish) setConfirmation(null)
  }, [canPublish])
  useEffect(() => {
    if (!canPreview) {
      bannerRequest.current++
      setConfirmation((previous) => (previous?.check ? null : previous))
    }
  }, [canPreview])
  useEffect(() => {
    if (initialized || !detail.data || detail.isFetching || detail.isError) return
    const restored = restoreAnnouncementForm(detail.data, null, Boolean(copyFromId && !messageId))
    form.reset(restored)
    setSavedStatus(copyFromId && !messageId ? "unsaved" : detail.data.status)
    if (restored.contentSource === "template") {
      pendingTemplate.current = {
        code: restored.templateCode,
        values: detail.data.contentParams ?? {},
        bindings: detail.data.variableBindings ?? {},
      }
      setTemplateKeyword(restored.templateCode)
    }
    setInitialized(true)
  }, [initialized, detail.data, detail.isFetching, detail.isError, form, copyFromId, messageId])
  useEffect(() => {
    const pending = pendingTemplate.current
    if (
      !pending ||
      templates.isFetching ||
      templates.isError ||
      values.contentSource !== "template" ||
      values.templateCode !== pending.code
    )
      return
    const template = templates.data?.records.find((row) => row.code === pending.code)
    if (!template) return
    setSelectedTemplate(template)
    form.setValue("variables", templateVariables(template, pending.values, pending.bindings))
    pendingTemplate.current = null
  }, [templates.data, templates.isFetching, templates.isError, values.contentSource, values.templateCode, form])
  const chooseTemplate = (code: string | null) => {
    clearTimeout(templateTimer.current)
    pendingTemplate.current = null
    const template =
      templates.data?.records.find((row) => row.code === code) ??
      (selectedTemplate?.code === code ? selectedTemplate : null)
    form.setValue("templateCode", code ?? "", { shouldDirty: true })
    form.setValue("variables", template ? templateVariables(template) : [], { shouldDirty: true })
    setSelectedTemplate(template)
    if (template) {
      form.setValue("category", template.category, { shouldDirty: true })
      form.setValue("level", template.level, { shouldDirty: true })
      form.setValue("mandatory", template.mandatory, { shouldDirty: true })
      form.setValue(
        "action",
        restoredAnnouncementAction(template.defaultAction, form.getValues("localized.defaultLocale")),
        { shouldDirty: true },
      )
    }
  }
  const payload = (intent: "draft" | "publish") =>
    buildAnnouncementPayload(form.getValues(), intent, { template: selectedTemplate, target: actionTarget })
  async function persist(body: ReturnType<typeof payload>) {
    const permission = id.current ? "notification:update" : "notification:create"
    requireAnnouncementPermission(permission, session)
    if (id.current) await writes.update.mutateAsync({ id: id.current, body })
    else {
      const response = await writes.create.mutateAsync(body)
      if (!current() || !hasPermission(useAuthStore.getState().userInfo, permission)) return null
      if (typeof response.messageId !== "string" || !response.messageId)
        throw new Error("Missing created announcement ID")
      id.current = response.messageId
      setSavedId(response.messageId)
    }
    if (!current() || !hasPermission(useAuthStore.getState().userInfo, permission)) return null
    setSavedStatus(
      body.saveAsDraft
        ? "draft"
        : body.publishAt
          ? "scheduled"
          : body.displayMode === "top_banner"
            ? "published"
            : "draft",
    )
    return id.current
  }
  const saveDraft = form.handleSubmit(async () => {
    if (lock.current || !current() || !canSave || registeredBanner) return
    lock.current = true
    setProcessing(true)
    form.clearErrors("root")
    try {
      if (await persist(payload("draft"))) toast.success(t("announcement.editor.draftSaved"))
    } catch (error) {
      showError(error)
    } finally {
      lock.current = false
      if (alive.current) setProcessing(false)
    }
  })
  async function checkBanner(body: ReturnType<typeof payload>) {
    const request = ++bannerRequest.current
    requireAnnouncementPermission("notification:preview", session)
    const result = await announcementData(
      checkAnnouncementBanner({ messageId: id.current, publishAt: body.publishAt, expireAt: body.expireAt }),
    )
    if (!current() || request !== bannerRequest.current) return null
    requireAnnouncementPermission("notification:preview", session)
    return result
  }
  const preparePublish = form.handleSubmit(async () => {
    if (lock.current || !current() || !canPublish) return
    lock.current = true
    setPreparing(true)
    form.clearErrors("root")
    const banner = form.getValues("displayMode") === "top_banner"
    try {
      requireAnnouncementPermission("notification:publish", session)
      const body = payload("publish"),
        check = banner ? await checkBanner(body) : null
      if (current() && (!banner || check)) {
        requireAnnouncementPermission("notification:publish", session)
        setConfirmation({ check })
      }
    } catch (error) {
      showError(error, banner ? "bannerCheckFailed" : "requestFailed")
    } finally {
      lock.current = false
      if (alive.current) setPreparing(false)
    }
  })
  async function confirmPublish() {
    if (lock.current || !confirmation || !current() || !canPublish) return
    lock.current = true
    setProcessing(true)
    form.clearErrors("root")
    const banner = form.getValues("displayMode") === "top_banner"
    try {
      requireAnnouncementPermission("notification:publish", session)
      if (banner) requireAnnouncementPermission("notification:preview", session)
      let body = payload("publish")
      if (banner) {
        if (!confirmation.check) throw new Error("Banner confirmation missing")
        const fingerprint = JSON.stringify(body)
        if (nonce.current.fingerprint !== fingerprint) nonce.current = { fingerprint, value: requestId() }
        body = bannerPublication(body, confirmation.check, id.current, nonce.current.value)
      }
      const saved = await persist(body)
      if (!saved || !current()) return
      if (!banner && !body.publishAt) {
        requireAnnouncementPermission("notification:publish", session)
        try {
          await writes.publish.mutateAsync({ id: saved })
        } catch (error) {
          showError(error, "publishFailed")
          return
        }
      }
      if (!current()) return
      toast.success(t(`announcement.editor.${body.publishAt ? "scheduled" : "published"}`))
      setConfirmation(null)
      onClose()
    } catch (error) {
      showError(error, banner ? "bannerPublishFailed" : "requestFailed")
      if (banner && current()) {
        setConfirmation(null)
        try {
          await checkBanner(payload("publish"))
        } catch {
          /* The existing error and form remain available for retry. */
        }
      }
    } finally {
      lock.current = false
      if (alive.current) setProcessing(false)
    }
  }
  const registeredBanner = values.displayMode === "top_banner" && savedStatus === "scheduled"
  return {
    form,
    values,
    detail,
    initialized,
    canSave,
    canPublish,
    savedStatus,
    processing,
    preparing,
    confirmation: canPublish && (!confirmation?.check || canPreview) ? confirmation : null,
    setConfirmation,
    registeredBanner,
    templates,
    selectedTemplate,
    templateKeyword,
    searchTemplates: (keyword: string) => {
      clearTimeout(templateTimer.current)
      templateTimer.current = setTimeout(() => {
        if (current() && form.getValues("contentSource") === "template") setTemplateKeyword(keyword)
      }, 250)
    },
    chooseTemplate,
    actionTargets,
    actionTarget,
    saveDraft,
    preparePublish,
    confirmPublish,
    error,
    session,
    disabled: !initialized || processing || preparing || Boolean(confirmation),
  }
}
