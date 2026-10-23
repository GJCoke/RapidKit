import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import type { UseFormReturn } from "react-hook-form"
import { usePermission } from "@/features/auth"
import { getAuthSession } from "@/services/auth-session"
import {
  previewAnnouncementAudience,
  previewAnnouncementContent,
  type AnnouncementContentPreview,
} from "@/services/api/announcement"
import type { NotificationTemplate } from "@/services/api/notification-template"
import {
  announcementData,
  requireAnnouncementPermission,
  useAnnouncementDirectories,
} from "@/services/hooks/use-announcements"
import {
  AnnouncementValidationError,
  announcementAudience,
  announcementTemplateParameters,
  recipientFields,
  type AnnouncementForm,
} from "./announcement-model"
const audienceKey = (value: AnnouncementForm) => JSON.stringify([value.audienceMode, value.audiences])
const contentKey = (value: AnnouncementForm, version?: number) =>
  JSON.stringify([value.contentSource, value.templateCode, value.variables, value.previewUserId, version])
export function useAnnouncementPreviews(
  form: UseFormReturn<AnnouncementForm>,
  values: AnnouncementForm,
  template: NotificationTemplate | null,
  session: number,
  disabled: boolean,
) {
  const { t } = useTranslation(),
    canPreview = usePermission("notification:preview"),
    canUsers = usePermission("user:options")
  const dynamic = values.contentSource === "template" && values.variables.some((row) => row.source !== "manual")
  const types =
    values.audienceMode === "selected" && values.displayMode !== "top_banner"
      ? values.audiences.flatMap((rule) => (rule.type === "all" ? [] : [rule.type]))
      : []
  const directories = useAnnouncementDirectories([...types, ...(dynamic ? ["user" as const] : [])])
  const audienceFingerprint = audienceKey(values),
    contentFingerprint = contentKey(values, template?.version)
  const [audience, setAudience] = useState<{ key: string; total?: number; error?: string } | null>(null)
  const [content, setContent] = useState<{
    key: string
    audience: string
    data?: AnnouncementContentPreview
    error?: string
  } | null>(null)
  const [audiencePending, setAudiencePending] = useState<string | null>(null),
    [contentPending, setContentPending] = useState<string | null>(null)
  const audienceRequest = useRef(0),
    contentRequest = useRef(0),
    alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!canPreview) {
      audienceRequest.current++
      setAudience(null)
      setAudiencePending(null)
    }
    if (!canPreview || !canUsers) {
      contentRequest.current++
      setContent(null)
      setContentPending(null)
    }
  }, [canPreview, canUsers])
  const current = () => alive.current && session === getAuthSession()
  const message = (error: unknown, key: string) =>
    error instanceof AnnouncementValidationError
      ? t(`announcement.editor.${error.key}`, error.params)
      : t(`announcement.editor.${key}`)
  const previewAudience = async () => {
    if (disabled || !canPreview || audiencePending === audienceFingerprint) return
    const request = ++audienceRequest.current,
      input = audienceKey(form.getValues())
    setAudience(null)
    setAudiencePending(input)
    try {
      requireAnnouncementPermission("notification:preview", session)
      const result = await announcementData(
        previewAnnouncementAudience({ audience: announcementAudience(form.getValues()) }),
      )
      if (current() && request === audienceRequest.current && input === audienceKey(form.getValues())) {
        requireAnnouncementPermission("notification:preview", session)
        setAudience({ key: input, total: result.total })
      }
    } catch (error) {
      if (current() && request === audienceRequest.current && input === audienceKey(form.getValues()))
        setAudience({ key: input, error: message(error, "previewFailed") })
    } finally {
      if (current() && request === audienceRequest.current) setAudiencePending(null)
    }
  }
  const previewContent = async () => {
    const input = contentKey(form.getValues(), template?.version),
      scope = audienceKey(form.getValues()),
      fingerprint = JSON.stringify([input, scope])
    if (disabled || !canPreview || !canUsers || contentPending === fingerprint) return
    const request = ++contentRequest.current
    setContent(null)
    setContentPending(fingerprint)
    try {
      requireAnnouncementPermission("notification:preview", session)
      requireAnnouncementPermission("user:options", session)
      const value = form.getValues()
      if (!template?.enabled || template.code !== value.templateCode)
        throw new AnnouncementValidationError("templateRequired")
      if (!value.previewUserId) throw new AnnouncementValidationError("previewUserRequired")
      const result = await announcementData(
        previewAnnouncementContent({
          templateCode: value.templateCode,
          ...announcementTemplateParameters(value.variables),
          audience: announcementAudience(value),
          previewUserId: value.previewUserId,
        }),
      )
      if (
        current() &&
        request === contentRequest.current &&
        input === contentKey(form.getValues(), template.version) &&
        scope === audienceKey(form.getValues())
      ) {
        requireAnnouncementPermission("notification:preview", session)
        requireAnnouncementPermission("user:options", session)
        setContent({ key: input, audience: scope, data: result })
      }
    } catch (error) {
      if (
        !current() ||
        request !== contentRequest.current ||
        input !== contentKey(form.getValues(), template?.version) ||
        scope !== audienceKey(form.getValues())
      )
        return
      const parsed = z
        .object({
          response: z.object({
            data: z.object({
              code: z.union([z.string(), z.number()]),
              data: z.object({ variableErrors: z.array(z.unknown()) }).nullish(),
            }),
          }),
        })
        .safeParse(error)
      let text = message(error, "contentPreviewFailed")
      if (parsed.success && String(parsed.data.response.data.code) === "92012") {
        const variables = (parsed.data.response.data.data?.variableErrors ?? []).flatMap((issue) => {
          const value = z
            .object({
              source: z.literal("recipient"),
              reason: z.literal("required_value_missing"),
              name: z.string(),
              field: z.enum(recipientFields),
            })
            .safeParse(issue)
          return value.success
            ? [`${value.data.name}（${t(`announcement.editor.valueSources.${value.data.field}`)}）`]
            : []
        })
        if (variables.length)
          text = t("announcement.editor.recipientFieldsMissing", { variables: [...new Set(variables)].join("、") })
      }
      setContent({ key: input, audience: scope, error: text })
    } finally {
      if (current() && request === contentRequest.current) setContentPending(null)
    }
  }
  const shownContent = current() && canPreview && canUsers && content?.key === contentFingerprint ? content : null
  return {
    directories,
    dynamic,
    canPreview,
    canUsers,
    previewAudience,
    previewContent,
    audienceLoading: audiencePending === audienceFingerprint,
    audienceTotal: current() && canPreview && audience?.key === audienceFingerprint ? audience.total : null,
    audienceError: current() && canPreview && audience?.key === audienceFingerprint ? audience.error : null,
    contentLoading: contentPending === JSON.stringify([contentFingerprint, audienceFingerprint]),
    contentData: shownContent?.data ?? null,
    contentError: shownContent?.error ?? null,
    contentStale: Boolean(shownContent && shownContent.audience !== audienceFingerprint),
  }
}
