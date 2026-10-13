<script setup lang="ts">
  import NotificationLevel from "@/components/notification/notification-level.vue"
  import { computed } from "vue"
  import { $t } from "@/locales"
  import { renderContent, renderTitle } from "@/utils/notification/content-render"
  import { resolveActionLabel } from "@/utils/notification/action-label"
  import { previewTemplate } from "../../templates/modules/template-editor"
  import { actualTemplateValues, parseObject, AnnouncementValidationError } from "./announcement-editor"
  import type { AnnouncementState } from "./announcement-editor"

  import { buildLocalizedContent, previewLocalizedEditor, LocalizedValidationError } from "./localized-editor"

  defineOptions({ name: "AnnouncementContentPreview" })
  const props = defineProps<{
    state: AnnouncementState
    template?: Api.Notification.Template | null
    rendered?: Api.Notification.ContentPreview | null
    stale?: boolean
  }>()
  const t = (key: string, params: Record<string, unknown> = {}) =>
    $t(`page.notification.manage.announcements.editor.${key}` as I18nFullKey, params)
  const actionLabel = computed(() => {
    if (props.state.contentMode !== "local" || props.state.actionType === "legacy")
      return { text: props.state.model.actionLabel, fallback: false, locale: "" }
    return resolveActionLabel(
      {
        localizedLabel: { defaultLocale: props.state.localized.defaultLocale, translations: props.state.actionLabels },
      },
      props.state.localized.previewLocale,
    )
  })
  const preview = computed(() => {
    const state = props.state
    if (state.contentMode === "raw") return { title: state.model.rawTitle, content: state.model.rawContent, issues: [] }
    try {
      if (state.contentMode === "local") {
        const result = previewLocalizedEditor(state.localized)
        const issues: string[] = []
        try {
          buildLocalizedContent(state.localized)
        } catch (error) {
          if (error instanceof LocalizedValidationError) issues.push(t(error.key, error.params))
        }
        if (result.fallback) issues.push(t("localizedFallback", { locale: t(`localizedLanguages.${result.locale}`) }))
        return { title: result.title, content: result.content, issues }
      }
      if (state.contentMode === "template") {
        if (!props.template) return { title: "", content: "", issues: [t("templatePreviewEmpty")] }
        if (state.variableRows.some((row) => row.source !== "manual")) {
          if (!props.rendered) return { title: "", content: "", issues: [t("personalizedPreviewEmpty")] }
          return props.rendered.contentMode === "i18n"
            ? translated(props.rendered.title, props.rendered.content, props.rendered.contentParams ?? {})
            : { title: props.rendered.title, content: props.rendered.content, issues: [] }
        }
        const template = props.template
        const values = actualTemplateValues(state.variableRows)
        if (template.contentMode === "raw") {
          const title = previewTemplate(template.titleTemplate, state.variableRows)
          const content = previewTemplate(template.contentTemplate, state.variableRows)
          const names = [...new Set([...title.issues, ...content.issues].map((issue) => issue.name))]
          return {
            title: title.text,
            content: content.text,
            issues: names.length ? [t("previewUnresolved", { names: names.join("、") })] : [],
          }
        }
        return translated(template.titleTemplate, template.contentTemplate, values)
      }
      return translated(state.model.i18NKey, state.model.i18NKey, parseObject(state.i18nParams))
    } catch (error) {
      return {
        title: "",
        content: "",
        issues: [error instanceof AnnouncementValidationError ? t(error.key, error.params) : t("i18nParamsInvalid")],
      }
    }
  })
  function translated(title: string, content: string, contentParams: Record<string, unknown>) {
    const message = { title, content, contentParams, contentMode: "i18n" as const }
    const renderedTitle = renderTitle(message)
    const renderedContent = renderContent(message)
    return {
      title: renderedTitle,
      content: renderedContent,
      issues: title && (renderedTitle === title || renderedContent === content) ? [t("translationMissing")] : [],
    }
  }
  const markdown = computed(() =>
    props.state.contentMode === "template"
      ? props.template?.contentFormat === "markdown"
      : props.state.contentMode === "raw" && props.state.model.rawFormat === "markdown",
  )
  const icon = computed(
    () =>
      ({
        info: "carbon:information",
        success: "carbon:checkmark-filled",
        warning: "carbon:warning-alt-filled",
        error: "carbon:error-filled",
      })[props.state.model.level],
  )
  const iconClass = computed(
    () =>
      ({ info: "text-info", success: "text-success", warning: "text-warning", error: "text-error" })[
        props.state.model.level
      ],
  )
</script>

<template>
  <div class="flex gap-12px" data-testid="announcement-content-preview" aria-live="polite">
    <SvgIcon
      :icon="icon"
      class="mt-2px shrink-0 text-24px"
      :class="iconClass"
      :aria-label="$t(`page.notification.level.${state.model.level}` as I18nFullKey)"
    />
    <div class="min-w-0 flex-1">
      <NotificationLevel :level="state.model.level" class="mb-8px" />
      <p v-if="stale" role="status" class="mb-8px mt-0 text-12px leading-19px text-warning">
        {{ t("contentPreviewAudienceChanged") }}
      </p>
      <p class="m-0 break-words text-14px font-600 leading-22px text-base-text-1">
        {{ preview.title || t("previewTitleEmpty") }}
      </p>
      <p class="mb-0 mt-6px whitespace-pre-wrap break-words text-13px leading-22px text-base-text-2">
        {{ preview.content || t("previewContentEmpty") }}
      </p>
      <p v-if="state.actionEnabled && actionLabel.text" class="mb-0 mt-10px break-words text-13px text-primary">
        {{ actionLabel.text }}
      </p>
      <p v-if="state.actionEnabled && actionLabel.fallback" class="mb-0 mt-6px text-12px text-base-text-3">
        {{ t("actionLabelFallback", { locale: t(`localizedLanguages.${actionLabel.locale}`) }) }}
      </p>
      <p class="mb-0 mt-10px text-12px text-base-text-3">
        {{ state.displayMode === "top_banner" ? $t("page.notification.banner.topBanner" as I18nFullKey) : t("inApp") }}
      </p>
      <p v-if="markdown" class="mb-0 mt-6px text-12px text-base-text-3">{{ t("markdownPreviewHint") }}</p>
      <p
        v-for="issue in preview.issues"
        :key="issue"
        class="mb-0 mt-8px break-words text-12px leading-19px text-warning"
      >
        {{ issue }}
      </p>
    </div>
  </div>
</template>
