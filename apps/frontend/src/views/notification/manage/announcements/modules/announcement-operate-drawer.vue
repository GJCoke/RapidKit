<script setup lang="ts">
  import { computed, ref, toRef } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import BannerSummary from "./banner-summary.vue"
  import AnnouncementLocalizedEditor from "./announcement-localized-editor.vue"
  import { notificationLocales } from "@/utils/notification/localized-content"
  import AnnouncementAudienceEditor from "./announcement-audience-editor.vue"
  import AnnouncementActionEditor from "./announcement-action-editor.vue"
  import AnnouncementContentPreview from "./announcement-content-preview.vue"
  import { useAnnouncementEditor } from "./use-announcement-editor"
  import { recipientFields } from "./announcement-editor"
  import {
    announcementTitleLimit,
    announcementContentLimit,
    countAnnouncementCharacters,
  } from "./announcement-text-limits"
  import { useAnnouncementContentPreview } from "./use-announcement-content-preview"

  defineOptions({ name: "AnnouncementOperateDrawer" })
  const props = defineProps<{ messageId?: string | null; copyFromId?: string | null }>()
  const emit = defineEmits<{ submitted: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const themeVars = useThemeVars()
  const {
    state,
    isBanner,
    bannerCheck,
    checkingBanner,
    registeredBanner,
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
  } = useAnnouncementEditor(visible, toRef(props, "messageId"), () => emit("submitted"), toRef(props, "copyFromId"))
  const {
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
  } = useAnnouncementContentPreview(state, selectedTemplate, disabled, visible)
  function sourceOptions(type: string) {
    return [
      { label: t("valueSources.manual"), value: "manual" },
      ...recipientFields.map((field) => ({
        label: t(`valueSources.${field}`),
        value: field,
        disabled: type !== "string" || isBanner.value,
      })),
    ]
  }
  const previewExpanded = ref(true)
  const advancedExpanded = ref<string[]>([])
  const title = computed(() =>
    $t(
      `page.notification.manage.announcements.${props.copyFromId ? "copy" : props.messageId ? "edit" : "add"}` as I18nFullKey,
    ),
  )
  const levelOptions = computed(() =>
    ["info", "success", "warning", "error"].map((value) => ({
      label: $t(`page.notification.level.${value}` as I18nFullKey),
      value,
    })),
  )
  const categoryOptions = computed(() =>
    [
      ["admin.announcement", "adminAnnouncement"],
      ["system.security", "systemSecurity"],
      ["user.invited", "userInvited"],
      ["user.mention", "userMention"],
      ["task.completed", "taskCompleted"],
    ].map(([value, key]) => ({ label: `${$t(`notification.category.${key}` as I18nFullKey)} · ${value}`, value })),
  )
  const reservedCategory = computed(() =>
    ["admin.announcement", "system.security"].includes(state.value.model.category),
  )
  const timezoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone
  function example(row: { rule: Record<string, unknown> }) {
    const value = row.rule.example ?? (Array.isArray(row.rule.examples) ? row.rule.examples[0] : undefined)
    return value === undefined || value === null || value === "" ? "" : String(value)
  }
</script>

<template>
  <NDrawer
    v-model:show="visible"
    display-directive="show"
    :width="840"
    class="announcement-drawer max-w-full"
    :mask-closable="!submitting"
    :close-on-esc="!submitting"
    :style="{
      '--text-color-1': themeVars.textColor1,
      '--text-color-2': themeVars.textColor2,
      '--text-color-3': themeVars.textColor3,
      '--border-color': themeVars.borderColor,
    }"
  >
    <NDrawerContent :native-scrollbar="false" :closable="!submitting">
      <template #header>
        <div>
          <h1 class="m-0 text-18px font-600 leading-26px">{{ title }}</h1>
          <p class="mb-0 mt-4px text-12px font-400 leading-18px text-base-text-3">
            {{ isBanner ? $t("page.notification.banner.editorSubtitle" as I18nFullKey) : t("subtitle") }}
          </p>
        </div>
      </template>
      <NSpin :show="loading">
        <NForm :model="state.model" :disabled="disabled" label-placement="top" :show-feedback="false">
          <NFormItem :label="$t('page.notification.banner.displayMode' as I18nFullKey)">
            <div class="w-full">
              <NRadioGroup
                v-model:value="state.displayMode"
                class="source-selector w-full"
                :disabled="disabled || registeredBanner"
                :aria-label="$t('page.notification.banner.displayMode' as I18nFullKey)"
              >
                <NRadioButton value="inbox"
                  ><SvgIcon icon="carbon:notification" class="mr-6px" />{{ t("inApp") }}</NRadioButton
                >
                <NRadioButton value="top_banner"
                  ><SvgIcon icon="carbon:bullhorn" class="mr-6px" />{{
                    $t("page.notification.banner.topBanner" as I18nFullKey)
                  }}</NRadioButton
                >
              </NRadioGroup>
              <p class="field-hint">
                {{ $t(`page.notification.banner.${isBanner ? "modeHint" : "inboxHint"}` as I18nFullKey) }}
              </p>
              <p v-if="registeredBanner" class="field-hint text-warning">
                {{ $t("page.notification.banner.scheduledEditHint" as I18nFullKey) }}
              </p>
            </div>
          </NFormItem>
          <section aria-labelledby="announcement-content-heading" class="mt-18px">
            <h2 id="announcement-content-heading" class="section-heading">
              <span>{{ t("contentHeading") }}</span
              ><span class="section-hint">{{ t("contentHint") }}</span>
            </h2>
            <NFormItem :label="t('contentSource')">
              <NRadioGroup
                v-model:value="state.contentMode"
                :aria-label="t('contentSource')"
                class="source-selector w-full"
                :disabled="disabled"
              >
                <NRadioButton value="raw"><SvgIcon icon="carbon:edit" class="mr-6px" />{{ t("rawMode") }}</NRadioButton>
                <NRadioButton value="template"
                  ><SvgIcon icon="carbon:document" class="mr-6px" />{{ t("templateMode") }}</NRadioButton
                >
                <NRadioButton value="local"
                  ><SvgIcon icon="carbon:earth" class="mr-6px" />{{ t("i18nMode") }}</NRadioButton
                >
                <NRadioButton v-if="state.model.i18NKey" value="i18n">{{ t("localizedLegacyMode") }}</NRadioButton>
              </NRadioGroup>
            </NFormItem>
            <div class="mt-14px grid grid-cols-1 gap-14px sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <NFormItem v-if="state.contentMode === 'raw'" :label="t('title')" required>
                <NInput
                  v-model:value="state.model.rawTitle"
                  :maxlength="announcementTitleLimit"
                  :count-graphemes="countAnnouncementCharacters"
                  show-count
                  :placeholder="t('titlePlaceholder')"
                  :input-props="{ 'aria-label': t('title') }"
                />
              </NFormItem>
              <NFormItem v-else-if="state.contentMode === 'template'" :label="t('template')" required>
                <NSelect
                  :value="state.model.templateCode"
                  :options="templateOptions"
                  :loading="templatesLoading"
                  :disabled="disabled || !canReadTemplates"
                  remote
                  filterable
                  clearable
                  :placeholder="t('templatePlaceholder')"
                  :aria-label="t('template')"
                  @search="searchTemplates"
                  @update:value="selectTemplate"
                />
              </NFormItem>
              <NFormItem v-else-if="state.contentMode === 'i18n'" :label="t('i18nKey')" required>
                <NInput
                  v-model:value="state.model.i18NKey"
                  :maxlength="256"
                  placeholder="notification.maintenance"
                  :input-props="{ 'aria-label': t('i18nKey') }"
                />
              </NFormItem>
              <NFormItem v-else :label="t('localizedDefaultLanguage')" required>
                <NSelect
                  v-model:value="state.localized.defaultLocale"
                  :options="
                    notificationLocales.map((value) => ({
                      value,
                      label: `${t(`localizedLanguages.${value}`)} · ${value}`,
                    }))
                  "
                  :disabled="disabled"
                  :aria-label="t('localizedDefaultLanguage')"
                />
              </NFormItem>
              <NFormItem :label="t('level')"
                ><NSelect v-model:value="state.model.level" :options="levelOptions" :aria-label="t('level')"
              /></NFormItem>
            </div>
            <NFormItem v-if="state.contentMode === 'raw'" :label="t('content')" required class="mt-14px">
              <NInput
                v-model:value="state.model.rawContent"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 8 }"
                :maxlength="announcementContentLimit"
                :count-graphemes="countAnnouncementCharacters"
                show-count
                :placeholder="t('contentPlaceholder')"
                :input-props="{ 'aria-label': t('content') }"
              />
            </NFormItem>
            <div v-else-if="state.contentMode === 'template'" class="mt-8px">
              <p class="field-hint">{{ t(canReadTemplates ? "templateHint" : "templatesForbidden") }}</p>
              <p v-if="templateError" class="mb-0 mt-8px text-12px text-error">
                {{ templateError }}
                <NButton text type="primary" :disabled="disabled" @click="loadTemplates()">{{ t("retry") }}</NButton>
              </p>
              <div v-if="selectedTemplate && state.variableRows.length" class="mt-14px overflow-x-auto">
                <table class="w-full min-w-640px table-fixed border-collapse text-left text-13px">
                  <thead class="bg-theme-fill text-12px text-base-text-3">
                    <tr>
                      <th class="w-30% px-10px py-8px font-500">{{ t("parameter") }}</th>
                      <th class="w-150px px-10px py-8px font-500">{{ t("valueSource") }}</th>
                      <th class="px-10px py-8px font-500">{{ t("actualValue") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in state.variableRows" :key="row.id" class="border-b border-theme-default">
                      <td class="break-all px-10px py-10px align-top">
                        <div class="min-h-34px flex items-center font-500">{{ row.name }}</div>
                        <p class="field-hint">
                          {{ row.type }} ·
                          <span :class="row.required ? 'text-primary' : ''">{{
                            t(row.required ? "required" : "optional")
                          }}</span>
                        </p>
                      </td>
                      <td class="px-10px py-10px align-top">
                        <NSelect
                          v-model:value="row.source"
                          :options="sourceOptions(row.type)"
                          :disabled="disabled"
                          :aria-label="t('valueSourceLabel', { name: row.name })"
                        />
                      </td>
                      <td class="px-10px py-10px align-top">
                        <span
                          v-if="row.source !== 'manual'"
                          class="min-h-34px flex items-center text-12px leading-20px text-base-text-3"
                          >{{ t("dynamicValue") }}</span
                        >
                        <NSelect
                          v-else-if="row.type === 'boolean'"
                          :value="row.example || null"
                          :options="[
                            { label: 'true', value: 'true' },
                            { label: 'false', value: 'false' },
                          ]"
                          clearable
                          :disabled="disabled"
                          :aria-label="t('variableLabel', { name: row.name })"
                          @update:value="row.example = $event ?? ''"
                        />
                        <NInput
                          v-else
                          v-model:value="row.example"
                          :disabled="disabled"
                          :placeholder="t('actualValuePlaceholder')"
                          :input-props="{ 'aria-label': t('variableLabel', { name: row.name }) }"
                        />
                        <p v-if="row.source === 'manual' && example(row)" class="field-hint break-all">
                          {{ t("exampleReference", { value: example(row) }) }}
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p class="field-hint">{{ t("variablesHint") }}</p>
                <p v-if="isBanner" class="field-hint" :class="hasDynamicValues ? 'text-warning' : ''">
                  {{ t("bannerManualOnly") }}
                </p>
                <p v-if="hasDynamicValues" class="field-hint">{{ t("builtinsHint") }}</p>
              </div>
              <p v-else-if="selectedTemplate" class="field-hint">{{ t("noParameters") }}</p>
            </div>
            <AnnouncementLocalizedEditor
              v-else-if="state.contentMode === 'local'"
              v-model="state.localized"
              :disabled="disabled"
            />
            <div v-else-if="state.contentMode === 'i18n'" class="mt-10px">
              <p class="field-hint mb-10px">{{ t("i18nHint") }}</p>
              <NFormItem :label="t('i18nParams')"
                ><NInput
                  v-model:value="state.i18nParams"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 6 }"
                  :input-props="{ 'aria-label': t('i18nParams') }"
              /></NFormItem>
            </div>
            <div class="mt-16px rounded-6px bg-primary/5 p-12px">
              <div class="flex flex-wrap items-center justify-between gap-6px">
                <NButton
                  text
                  type="primary"
                  :aria-expanded="previewExpanded"
                  aria-controls="announcement-preview"
                  @click="previewExpanded = !previewExpanded"
                  ><SvgIcon icon="carbon:view" class="mr-6px" />{{ t("preview")
                  }}<SvgIcon :icon="previewExpanded ? 'carbon:chevron-up' : 'carbon:chevron-down'" class="ml-6px"
                /></NButton>
                <div v-if="state.contentMode === 'local'" class="flex items-center gap-8px">
                  <span class="text-12px text-base-text-3">{{ t("localizedPreviewLanguage") }}</span>
                  <NSelect
                    v-model:value="state.localized.previewLocale"
                    size="small"
                    class="w-160px"
                    :options="
                      notificationLocales.map((value) => ({
                        value,
                        label: `${t(`localizedLanguages.${value}`)} · ${value}`,
                      }))
                    "
                    :disabled="disabled"
                    :aria-label="t('localizedPreviewLanguage')"
                  />
                </div>
                <span v-else class="text-12px text-base-text-3">{{
                  isBanner ? $t("page.notification.banner.previewHint" as I18nFullKey) : t("previewHint")
                }}</span>
              </div>
              <div
                v-if="previewExpanded"
                id="announcement-preview"
                class="mt-10px border-t border-theme-default pt-10px"
              >
                <div v-if="hasDynamicValues && !isBanner" class="mb-14px">
                  <label class="mb-6px block text-13px">{{ t("previewUser") }}</label>
                  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-8px">
                    <NSelect
                      v-model:value="previewUserId"
                      :options="userOptions"
                      :loading="usersLoading"
                      :disabled="disabled || !canReadUsers"
                      filterable
                      clearable
                      :placeholder="t('previewUserPlaceholder')"
                      :aria-label="t('previewUser')"
                    />
                    <NButton
                      type="primary"
                      ghost
                      :loading="contentLoading"
                      :disabled="disabled || !canPreviewContent"
                      @click="previewContent"
                      >{{ t("previewContent") }}</NButton
                    >
                  </div>
                  <p v-if="!canPreviewContent" class="field-hint text-warning">{{ t("contentPreviewForbidden") }}</p>
                  <p v-if="usersFailed" class="field-hint text-warning">
                    {{ t("previewUsersFailed") }}
                    <NButton text type="primary" :disabled="disabled" @click="loadPreviewUsers">{{
                      t("retry")
                    }}</NButton>
                  </p>
                  <p class="field-hint">{{ t("recipientPreviewHint") }}</p>
                  <p v-if="contentError" role="alert" class="mb-0 mt-8px text-12px text-error">{{ contentError }}</p>
                </div>
                <AnnouncementContentPreview
                  :state="state"
                  :template="selectedTemplate"
                  :rendered="renderedContent"
                  :stale="contentStale"
                />
              </div>
            </div>
          </section>
          <section
            v-if="!isBanner"
            aria-labelledby="announcement-audience-heading"
            class="mt-14px border-t border-theme-default pt-14px"
          >
            <h2 id="announcement-audience-heading" class="section-heading">
              <span>{{ t("audienceHeading") }}</span
              ><span class="section-hint">{{ t("audienceHint") }}</span>
            </h2>
            <div class="flex items-start justify-between gap-16px">
              <NRadioGroup v-model:value="state.audienceMode" :disabled="disabled" :aria-label="t('audienceScope')">
                <div class="flex-col gap-10px">
                  <NRadio value="all"
                    >{{ t("allUsers")
                    }}<span class="ml-10px text-12px text-base-text-3">{{ t("allUsersHint") }}</span></NRadio
                  ><NRadio value="selected"
                    >{{ t("selectedUsers")
                    }}<span class="ml-10px text-12px text-base-text-3">{{ t("selectedUsersHint") }}</span></NRadio
                  >
                </div>
              </NRadioGroup>
              <div class="shrink-0 text-right">
                <NButton
                  v-if="canPreview"
                  text
                  type="primary"
                  :loading="previewing"
                  :disabled="disabled"
                  @click="previewAudience"
                  >{{ t("previewAudience") }}</NButton
                >
                <p
                  class="mb-0 mt-4px text-12px"
                  :class="previewTotal === null ? 'text-base-text-3' : 'text-primary'"
                  aria-live="polite"
                >
                  {{ previewTotal === null ? t("audienceUnchecked") : t("audienceCount", { count: previewTotal }) }}
                </p>
              </div>
            </div>
            <AnnouncementAudienceEditor
              v-if="state.audienceMode === 'selected'"
              v-model="state.audiences"
              :disabled="disabled"
              class="mt-14px"
            />
            <p v-if="previewTotal !== null" class="field-hint">{{ t("audienceEstimate") }}</p>
            <p v-if="previewError" role="alert" class="mb-0 mt-8px text-12px text-error">{{ previewError }}</p>
          </section>
          <section aria-labelledby="announcement-time-heading" class="mt-14px border-t border-theme-default pt-14px">
            <h2 id="announcement-time-heading" class="section-heading">
              <span>{{ isBanner ? $t("page.notification.banner.timeHeading" as I18nFullKey) : t("timeHeading") }}</span
              ><span class="section-hint">{{
                isBanner ? $t("page.notification.banner.timeHint" as I18nFullKey) : t("timeHint")
              }}</span>
            </h2>
            <NRadioGroup v-model:value="state.delivery" :disabled="disabled" :aria-label="t('delivery')"
              ><NSpace :size="20"
                ><NRadio value="now">{{
                  isBanner ? $t("page.notification.banner.now" as I18nFullKey) : t("now")
                }}</NRadio
                ><NRadio value="scheduled">{{
                  isBanner ? $t("page.notification.banner.timed" as I18nFullKey) : t("timed")
                }}</NRadio></NSpace
              ></NRadioGroup
            >
            <div v-if="state.delivery === 'scheduled'" class="mt-12px">
              <NDatePicker
                v-model:formatted-value="state.model.publishAt"
                type="datetime"
                value-format="yyyy-MM-dd'T'HH:mm:ss"
                clearable
                class="w-full"
                :disabled="disabled"
                :placeholder="t('publishAtPlaceholder')"
                :input-props="{ 'aria-label': t('publishAt') }"
              />
              <p class="field-hint">
                {{
                  isBanner
                    ? $t("page.notification.banner.scheduleHint" as I18nFullKey, { timezone: timezoneLabel })
                    : t("scheduleHint", { timezone: timezoneLabel })
                }}
              </p>
            </div>
            <div class="mt-14px flex flex-wrap items-center gap-12px">
              <span class="text-13px">{{ t("expires") }}</span
              ><NCheckbox :checked="!state.expires" :disabled="disabled" @update:checked="state.expires = !$event">{{
                t("forever")
              }}</NCheckbox
              ><NDatePicker
                v-if="state.expires"
                v-model:formatted-value="state.model.expireAt"
                type="datetime"
                value-format="yyyy-MM-dd'T'HH:mm:ss"
                clearable
                class="min-w-200px flex-1"
                :disabled="disabled"
                :placeholder="t('expireAtPlaceholder')"
                :input-props="{ 'aria-label': t('expires') }"
              />
            </div>
            <p class="field-hint">
              {{ isBanner ? $t("page.notification.banner.expireHint" as I18nFullKey) : t("expireHint") }}
            </p>
            <div v-if="!isBanner" class="mt-12px flex items-start gap-12px">
              <span class="shrink-0 text-13px leading-22px">{{ t("mandatory") }}</span
              ><NSwitch v-model:value="state.model.mandatory" :disabled="disabled" :aria-label="t('mandatory')" />
              <div class="min-w-0 text-12px leading-20px text-base-text-3">
                {{ t("mandatoryHint") }}
                <p v-if="reservedCategory" class="mb-0 mt-4px">{{ t("reservedHint") }}</p>
              </div>
            </div>
          </section>
          <NCollapse
            v-model:expanded-names="advancedExpanded"
            class="mt-16px rounded-6px border border-theme-default px-14px py-12px"
          >
            <NCollapseItem name="advanced"
              ><template #header
                ><span class="flex items-center gap-8px"
                  ><SvgIcon icon="carbon:settings" />{{ t("advanced") }}</span
                ></template
              ><template #header-extra
                ><span class="text-12px text-base-text-3">{{ t("advancedHint") }}</span></template
              >
              <NFormItem v-if="!isBanner" :label="t('category')" required
                ><div class="w-full">
                  <NSelect
                    v-model:value="state.model.category"
                    :options="categoryOptions"
                    filterable
                    tag
                    :disabled="disabled"
                    :aria-label="t('category')"
                  />
                  <p class="field-hint">{{ t("categoryHint") }}</p>
                </div></NFormItem
              >
              <div v-if="state.contentMode === 'raw'" class="mt-14px">
                <NFormItem :label="t('format')"
                  ><NSelect
                    v-model:value="state.model.rawFormat"
                    :options="[
                      { label: t('plainText'), value: 'plain_text' },
                      { label: 'Markdown', value: 'markdown' },
                    ]"
                    :disabled="disabled"
                    :aria-label="t('format')"
                /></NFormItem>
              </div>
              <AnnouncementActionEditor :state="state" :disabled="disabled" class="mt-18px" />
            </NCollapseItem>
          </NCollapse>
        </NForm>
      </NSpin>
      <NAlert v-if="formError" type="error" :show-icon="false" class="mt-16px" role="alert"
        >{{ formError
        }}<NButton v-if="loadFailed && !loading" text type="primary" :disabled="submitting" @click="initialize">{{
          t("reload")
        }}</NButton></NAlert
      >
      <template #footer
        ><div class="w-full">
          <div class="flex flex-wrap items-center justify-between gap-12px">
            <span class="text-12px text-base-text-3">{{ t(`savedStates.${savedStatus}`) }}</span
            ><NSpace :size="10"
              ><NButton :disabled="submitting" @click="visible = false">{{ $t("common.cancel") }}</NButton
              ><NButton
                type="primary"
                ghost
                :disabled="disabled || !canSave || registeredBanner"
                :loading="submitting && !confirming"
                @click="saveDraft"
                >{{ t("saveDraft") }}</NButton
              ><NButton
                v-if="canPublish"
                type="primary"
                :disabled="disabled"
                :loading="checkingBanner"
                @click="preparePublish"
                >{{ t(state.delivery === "scheduled" ? "confirmSchedule" : "confirmPublish") }}</NButton
              ></NSpace
            >
          </div>
          <p class="mb-0 mt-8px flex flex-wrap justify-between gap-6px text-12px text-base-text-3">
            <span>{{ t("draftHint") }}</span
            ><span
              >{{ isBanner ? $t("page.notification.banner.topBanner" as I18nFullKey) : t("inApp") }} ·
              {{ audienceSummary }} · {{ deliverySummary }}</span
            >
          </p>
        </div></template
      >
    </NDrawerContent>
  </NDrawer>
  <NModal
    v-model:show="confirming"
    preset="dialog"
    :title="t('confirmationTitle')"
    :positive-text="
      isBanner
        ? $t(
            `page.notification.banner.${state.delivery === 'scheduled' ? 'confirmSchedule' : bannerCheck?.current ? 'confirmReplace' : 'confirmPublish'}` as I18nFullKey,
          )
        : t(state.delivery === 'scheduled' ? 'confirmSchedule' : 'confirmPublish')
    "
    :negative-text="$t('common.cancel')"
    :mask-closable="!submitting"
    :close-on-esc="!submitting"
    :closable="!submitting"
    :positive-button-props="{ loading: submitting, disabled: submitting }"
    :negative-button-props="{ disabled: submitting }"
    @positive-click="confirmPublish"
  >
    <div class="my-16px">
      <AnnouncementContentPreview
        :state="state"
        :template="selectedTemplate"
        :rendered="renderedContent"
        :stale="contentStale"
      />
      <BannerSummary
        v-if="isBanner && bannerCheck"
        :check="bannerCheck"
        :delivery="state.delivery"
        :message-id="messageId"
        confirmation
        class="mt-16px"
      />
      <p v-if="hasDynamicValues && !isBanner" class="field-hint">{{ t("recipientPreviewHint") }}</p>
      <div class="mt-16px border-t border-theme-default pt-12px text-13px leading-24px">
        <p class="m-0">{{ t("audienceScope") }}：{{ audienceSummary }}</p>
        <p class="m-0">{{ t("delivery") }}：{{ deliverySummary }}</p>
        <p class="m-0">{{ t("expires") }}：{{ state.expires ? state.model.expireAt : t("forever") }}</p>
        <p v-if="!isBanner && previewTotal === null" class="mb-0 mt-8px text-warning">{{ t("confirmUnchecked") }}</p>
        <p v-else-if="!isBanner" class="m-0">{{ t("audienceCount", { count: previewTotal }) }}</p>
      </div>
      <NAlert v-if="formError" type="error" :show-icon="false" class="mt-12px">{{ formError }}</NAlert>
    </div>
  </NModal>
</template>

<style scoped>
  .section-heading {
    @apply mb-12px mt-0 flex flex-wrap items-baseline gap-x-12px gap-y-4px text-16px font-600 leading-24px;
  }
  .section-hint {
    @apply text-12px font-400 text-base-text-3;
  }
  .field-hint {
    @apply mb-0 mt-6px text-12px leading-18px text-base-text-3;
  }
  .source-selector {
    @apply flex gap-8px;
  }
  .source-selector :deep(.n-radio-button) {
    @apply min-w-0 flex flex-1 items-center justify-center rounded-4px;
    border-left: 1px solid var(--n-button-border-color);
    border-right: 1px solid var(--n-button-border-color);
  }
  .source-selector :deep(.n-radio-button--checked) {
    border-color: var(--n-button-border-color-active);
    @apply bg-primary/5;
  }
  .source-selector :deep(.n-radio__label) {
    @apply flex items-center justify-center whitespace-nowrap;
  }
  .source-selector :deep(.n-radio-button__state-border) {
    border-radius: 4px;
  }
  .source-selector :deep(.n-radio-group__splitor) {
    display: none;
  }
  .announcement-drawer :deep(.n-drawer-body-content-wrapper) {
    padding: 16px 24px;
  }
  .announcement-drawer :deep(.n-form-item-label) {
    padding-bottom: 6px;
    font-size: 13px;
  }
  @media (max-width: 639px) {
    .announcement-drawer :deep(.n-drawer-body-content-wrapper) {
      padding: 18px 16px;
    }
    .section-hint {
      @apply w-full;
    }
    .source-selector {
      @apply gap-4px;
    }
    .source-selector :deep(.n-radio-button) {
      padding: 0 6px;
      font-size: 12px;
    }
  }
</style>
