<script setup lang="ts">
  import { computed, watch } from "vue"
  import { $t } from "@/locales"
  import { localizedParameterNames, notificationLocales } from "@/utils/notification/localized-content"
  import type { NotificationLocale } from "@/utils/notification/localized-content"
  import { syncLocalizedParameters } from "./localized-editor"
  import type { LocalizedEditorState } from "./localized-editor"
  import {
    announcementTitleLimit,
    announcementContentLimit,
    countAnnouncementCharacters,
  } from "./announcement-text-limits"

  defineOptions({ name: "AnnouncementLocalizedEditor" })
  const state = defineModel<LocalizedEditorState>({ required: true })
  const props = defineProps<{ disabled?: boolean }>()
  const t = (key: string, params: Record<string, unknown> = {}) =>
    $t(`page.notification.manage.announcements.editor.${key}` as I18nFullKey, params)
  const names = computed(() => localizedParameterNames(state.value.translations))
  watch(
    () => state.value.translations,
    () => syncLocalizedParameters(state.value),
    { deep: true, immediate: true },
  )
  const text = computed(() => state.value.translations[state.value.activeLocale])
  const required = computed(() => state.value.activeLocale === state.value.defaultLocale)
  const typeOptions = computed(() =>
    ["string", "number", "boolean"].map((value) => ({ value, label: t(`localizedTypes.${value}`) })),
  )
  const boolOptions = computed(() => [
    { value: "true", label: t("localizedTrue") },
    { value: "false", label: t("localizedFalse") },
  ])
  const partial = computed(() => Boolean(text.value.title.trim()) !== Boolean(text.value.content.trim()))
  function languageTabProps(locale: NotificationLocale) {
    return {
      role: "tab",
      id: `announcement-language-${locale}`,
      tabindex: !props.disabled && state.value.activeLocale === locale ? 0 : -1,
      "aria-selected": state.value.activeLocale === locale,
      "aria-controls": "announcement-language-fields",
      "data-language-tab": locale,
      onKeydown(event: KeyboardEvent) {
        if (props.disabled) return
        let selected = locale
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          const offset = event.key === "ArrowRight" ? 1 : -1
          selected =
            notificationLocales[
              (notificationLocales.indexOf(locale) + offset + notificationLocales.length) % notificationLocales.length
            ]!
        } else if (event.key !== "Enter" && event.key !== " ") {
          return
        }
        event.preventDefault()
        state.value.activeLocale = selected
        state.value.previewLocale = selected
        ;(event.currentTarget as HTMLElement)
          .closest(".n-tabs")
          ?.querySelector<HTMLElement>(`[data-language-tab="${selected}"]`)
          ?.focus()
      },
    }
  }
  function status(locale: string) {
    if (locale === state.value.defaultLocale) return t("localizedDefaultBadge")
    const value = state.value.translations[locale as keyof typeof state.value.translations]
    return t(
      value.title.trim() && value.content.trim()
        ? "localizedFilled"
        : value.title.trim() || value.content.trim()
          ? "localizedIncomplete"
          : "localizedUnconfigured",
    )
  }
</script>

<template>
  <div class="mt-18px" data-testid="announcement-localized-editor">
    <p class="mb-10px mt-0 text-12px leading-20px text-base-text-3">{{ t("localizedHint") }}</p>
    <NTabs
      v-model:value="state.activeLocale"
      type="line"
      role="tablist"
      :aria-label="t('localizedEditLanguage')"
      animated
      @update:value="state.previewLocale = $event"
    >
      <NTabPane
        v-for="locale in notificationLocales"
        :key="locale"
        :name="locale"
        display-directive="show"
        :disabled="disabled"
        :tab-props="languageTabProps(locale)"
      >
        <template #tab>
          <span class="mr-6px">{{ t(`localizedLanguages.${locale}`) }}</span>
          <span class="mr-6px text-11px text-base-text-3">{{ locale }}</span>
          <NTag size="tiny" :bordered="false">{{ status(locale) }}</NTag>
        </template>
      </NTabPane>
    </NTabs>
    <div
      id="announcement-language-fields"
      role="tabpanel"
      :aria-labelledby="`announcement-language-${state.activeLocale}`"
    >
      <div class="mb-12px mt-6px flex flex-wrap items-center justify-between gap-6px">
        <span class="text-13px font-500">{{
          t("localizedLanguageContent", { locale: t(`localizedLanguages.${state.activeLocale}`) })
        }}</span>
        <span class="text-12px text-base-text-3">{{
          t(required ? "localizedDefaultHint" : "localizedOptionalHint")
        }}</span>
      </div>
      <NFormItem :label="t('title')" :required="required">
        <NInput
          v-model:value="text.title"
          :maxlength="announcementTitleLimit"
          :count-graphemes="countAnnouncementCharacters"
          show-count
          :disabled="disabled"
          :placeholder="t('localizedTitlePlaceholder')"
          :input-props="{ 'aria-label': t('localizedTitleLabel', { locale: state.activeLocale }) }"
        />
      </NFormItem>
      <NFormItem :label="t('content')" :required="required" class="mt-12px">
        <NInput
          v-model:value="text.content"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :maxlength="announcementContentLimit"
          :count-graphemes="countAnnouncementCharacters"
          show-count
          :disabled="disabled"
          :placeholder="t('localizedContentPlaceholder')"
          :input-props="{ 'aria-label': t('localizedContentLabel', { locale: state.activeLocale }) }"
        />
      </NFormItem>
      <p class="mb-0 mt-6px text-12px leading-20px text-base-text-3">
        {{ t("localizedPlaceholderHint", { example: "{system}" }) }}
      </p>
      <p v-if="partial" role="alert" class="mb-0 mt-6px text-12px text-error">
        {{ t("localizedPartial", { locale: state.activeLocale }) }}
      </p>
    </div>
    <div class="mb-4px mt-20px flex items-baseline gap-8px">
      <h3 class="m-0 text-14px font-600">{{ t("localizedParameters") }}</h3>
      <span class="text-12px text-base-text-3">{{ t("localizedParameterCount", { count: names.length }) }}</span>
    </div>
    <p class="mb-10px mt-0 text-12px leading-20px text-base-text-3">{{ t("localizedParametersHint") }}</p>
    <div v-if="names.length" class="localized-parameters">
      <div class="parameter-head bg-theme-fill text-12px text-base-text-3">
        <span>{{ t("parameter") }}</span
        ><span>{{ t("type") }}</span
        ><span>{{ t("actualValue") }}</span>
      </div>
      <div v-for="name in names" :key="name" class="parameter-row border-b border-theme-default">
        <code class="break-all text-13px" v-text="'{' + name + '}'"></code>
        <NSelect
          v-model:value="state.parameters[name]!.type"
          :options="typeOptions"
          :disabled="disabled"
          :aria-label="t('localizedTypeLabel', { name })"
          @update:value="state.parameters[name]!.value = $event === 'boolean' ? 'true' : state.parameters[name]!.value"
        />
        <div class="parameter-value min-w-0">
          <NSelect
            v-if="state.parameters[name]!.type === 'boolean'"
            v-model:value="state.parameters[name]!.value"
            :options="boolOptions"
            :disabled="disabled"
            :aria-label="t('variableLabel', { name })"
          />
          <NInput
            v-else
            v-model:value="state.parameters[name]!.value"
            :disabled="disabled"
            :placeholder="t('actualValuePlaceholder')"
            :input-props="{ 'aria-label': t('variableLabel', { name }) }"
          />
        </div>
      </div>
    </div>
    <p v-else class="m-0 rounded-4px bg-theme-fill px-12px py-16px text-center text-12px text-base-text-3">
      {{ t("localizedNoParameters") }}
    </p>
  </div>
</template>
<style scoped>
  .parameter-head,
  .parameter-row {
    display: grid;
    grid-template-columns: minmax(100px, 1fr) 110px minmax(120px, 1.5fr);
    gap: 12px;
    align-items: center;
    padding: 8px 10px;
  }
  @media (max-width: 520px) {
    .parameter-head {
      display: none;
    }
    .parameter-row {
      grid-template-columns: minmax(0, 1fr) 110px;
      gap: 8px;
    }
    .parameter-value {
      grid-column: 1 / 3;
    }
  }
</style>
