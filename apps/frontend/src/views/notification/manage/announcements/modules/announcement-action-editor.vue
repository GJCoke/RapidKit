<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, useId, watch } from "vue"
  import { useAuth } from "@/hooks/business/auth"
  import { $t } from "@/locales"
  import { fetchGetAnnouncementActionTargets, fetchPreviewAnnouncementAction } from "@/service/api"
  import { navigateToAction } from "@/utils/notification/action-nav"
  import { notificationLocales } from "@/utils/notification/localized-content"
  import { countAnnouncementCharacters } from "./announcement-text-limits"
  import { actionTargetTree, buildAnnouncementAction } from "./announcement-action"
  import { AnnouncementValidationError } from "./announcement-editor"
  import type { AnnouncementState } from "./announcement-editor"

  defineOptions({ name: "AnnouncementActionEditor" })
  type ActionParameter = NonNullable<Api.Notification.ActionTarget["parameters"]>[number]
  const props = defineProps<{ state: AnnouncementState; disabled?: boolean }>()
  const labelId = useId()
  const localizedLabels = computed(() => props.state.contentMode === "local" && props.state.actionType !== "legacy")
  const { hasAuth } = useAuth()
  const t = (key: string, params: Record<string, unknown> = {}) =>
    $t(`page.notification.manage.announcements.editor.${key}` as I18nFullKey, params)
  const mayReadTargets = computed(() => hasAuth("notification:preview"))
  const mayPreview = computed(() => hasAuth("notification:preview"))
  const targets = ref<Api.Notification.ActionTarget[]>([])
  const directoryStatus = ref<"idle" | "loading" | "loaded" | "error">("idle")
  const tree = computed(() => actionTargetTree(targets.value))
  const resolved = ref<Api.Notification.ActionInput | null>(null)
  const previewLoading = ref(false)
  const opening = ref(false)
  const previewError = ref("")
  let version = 0
  let active = true
  onBeforeUnmount(() => {
    active = false
    version++
  })

  const choice = computed(() => (props.state.actionEnabled ? props.state.actionType : "none"))
  function seedLocalizedLabel() {
    if (!localizedLabels.value || notificationLocales.some((locale) => props.state.actionLabels[locale])) return
    if (props.state.model.actionLabel)
      props.state.actionLabels[props.state.localized.defaultLocale] = props.state.model.actionLabel
  }
  watch(() => props.state.contentMode, seedLocalizedLabel, { immediate: true })
  function changeType(type: "none" | AnnouncementState["actionType"]) {
    props.state.actionEnabled = type !== "none"
    if (type !== "none") props.state.actionType = type
    if (type === "external") {
      if (!props.state.model.actionLabel) props.state.model.actionLabel = t("actionExternalLabel")
      if (localizedLabels.value && notificationLocales.every((locale) => !props.state.actionLabels[locale])) {
        for (const locale of notificationLocales)
          props.state.actionLabels[locale] = $t(
            "page.notification.manage.announcements.editor.actionExternalLabel",
            {},
            { locale },
          )
      }
    }
  }
  function attachTarget() {
    props.state.actionTarget = targets.value.find((target) => target.menuId === props.state.actionMenuId) ?? null
  }
  async function loadTargets() {
    if (!mayReadTargets.value || directoryStatus.value === "loading" || directoryStatus.value === "loaded") return
    directoryStatus.value = "loading"
    try {
      const { data, error } = await fetchGetAnnouncementActionTargets()
      if (!active) return
      if (error || !data) {
        directoryStatus.value = "error"
        return
      }
      targets.value = data
      directoryStatus.value = "loaded"
      attachTarget()
    } catch {
      if (active) directoryStatus.value = "error"
    }
  }
  watch(
    () => [props.state.actionEnabled, props.state.actionType, mayReadTargets.value],
    () => {
      if (props.state.actionEnabled && props.state.actionType === "menu") void loadTargets()
    },
    { immediate: true },
  )
  watch(() => [props.state, props.state.actionMenuId], attachTarget)

  function selectMenu(value: string | number | null) {
    const target = targets.value.find((row) => row.menuId === value)
    props.state.actionMenuId = target?.menuId ?? null
    props.state.actionTarget = target ?? null
    props.state.actionValues = {}
    props.state.actionQuery = {}
    if (!target) return
    if (!props.state.model.actionLabel) props.state.model.actionLabel = target.label
    seedLocalizedLabel()
    for (const row of target.parameters ?? []) {
      const values = row.location === "path" ? props.state.actionValues : props.state.actionQuery
      values[row.name] = row.defaultValue ?? ""
    }
  }
  const parameters = computed<ActionParameter[]>(() => {
    if (props.state.actionTarget) return props.state.actionTarget.parameters ?? []
    // Saved values stay visible and editable while directory metadata is unavailable.
    return [
      ...Object.keys(props.state.actionValues).map((name) => ({ name, location: "path" as const })),
      ...Object.keys(props.state.actionQuery).map((name) => ({ name, location: "query" as const })),
    ].map((row) => ({ ...row, required: false, defaultValue: null, descriptionKey: null, example: null }))
  })
  function parameterLabel(parameter: ActionParameter) {
    return t(parameter.location === "path" ? "actionPathParameter" : "actionQueryParameter", { name: parameter.name })
  }
  function parameterDescription(parameter: ActionParameter) {
    if (
      [
        "page.notification.announcements.actionUserIdHelp",
        "notification.action.userId",
        "notification.action.userDetailId",
      ].includes(parameter.descriptionKey ?? "")
    ) {
      return t("actionUserIdDescription")
    }
    return t(parameter.location === "path" ? "actionPathDescription" : "actionQueryDescription", {
      name: parameter.name,
    })
  }
  function updateParameter(parameter: ActionParameter, value: string) {
    const values = parameter.location === "path" ? props.state.actionValues : props.state.actionQuery
    values[parameter.name] = value
  }
  const fingerprint = computed(() =>
    JSON.stringify({
      enabled: props.state.actionEnabled,
      contentMode: props.state.contentMode,
      type: props.state.actionType,
      menuId: props.state.actionMenuId,
      values: props.state.actionValues,
      query: props.state.actionQuery,
      url: props.state.actionUrl,
      route: props.state.model.actionRoute,
      label: props.state.model.actionLabel,
      localizedLabels: props.state.actionLabels,
      defaultLocale: props.state.localized.defaultLocale,
      params: props.state.actionParams,
      target: props.state.actionTarget,
    }),
  )
  watch(
    fingerprint,
    () => {
      version++
      resolved.value = null
      previewError.value = ""
      previewLoading.value = false
      opening.value = false
    },
    { flush: "sync" },
  )
  async function preview() {
    if (props.disabled || !mayPreview.value || previewLoading.value) return
    const requestVersion = ++version
    const original = fingerprint.value
    resolved.value = null
    previewError.value = ""
    try {
      const action = buildAnnouncementAction(props.state)
      if (!action) return
      previewLoading.value = true
      const { data, error } = await fetchPreviewAnnouncementAction(action)
      if (!active || version !== requestVersion || fingerprint.value !== original) return
      if (error || !data) previewError.value = t("actionPreviewFailed")
      else resolved.value = data
    } catch (error) {
      if (!active || version !== requestVersion) return
      previewError.value =
        error instanceof AnnouncementValidationError ? t(error.key, error.params) : t("actionPreviewFailed")
    } finally {
      if (active && version === requestVersion) previewLoading.value = false
    }
  }
  const resolvedDestination = computed(() => {
    const action = resolved.value
    if (!action) return ""
    if (action.type === "external") return action.url ?? ""
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries(action.query ?? {})) {
      if (value !== null && value !== undefined) search.set(name, String(value))
    }
    const path = action.path ?? action.route ?? ""
    return `${path}${search.size ? `?${search.toString()}` : ""}`
  })
  async function openTarget() {
    if (!resolved.value || props.disabled || opening.value) return
    const requestVersion = version
    opening.value = true
    try {
      if (!(await navigateToAction(resolved.value, { newWindow: true })) && active && version === requestVersion) {
        previewError.value = t("actionOpenFailed")
      }
    } catch {
      if (active && version === requestVersion) previewError.value = t("actionOpenFailed")
    } finally {
      if (active && version === requestVersion) opening.value = false
    }
  }
</script>

<template>
  <div class="flex-col gap-12px">
    <NRadioGroup :value="choice" :disabled="disabled" :aria-label="t('actionType')" @update:value="changeType">
      <NSpace :size="12">
        <NRadio value="none">{{ t("actionNone") }}</NRadio>
        <NRadio value="menu">{{ t("actionMenu") }}</NRadio>
        <NRadio value="external">{{ t("actionExternal") }}</NRadio>
        <NRadio v-if="state.actionType === 'legacy'" value="legacy">{{ t("actionLegacy") }}</NRadio>
      </NSpace>
    </NRadioGroup>
    <p class="m-0 text-12px leading-18px text-base-text-3">{{ t("actionChoiceHint") }}</p>
    <template v-if="state.actionEnabled">
      <template v-if="state.actionType === 'menu'">
        <NFormItem :label="t('actionMenu')" :show-feedback="false">
          <NTreeSelect
            :value="state.actionMenuId"
            :options="tree"
            filterable
            clearable
            default-expand-all
            check-strategy="child"
            :loading="directoryStatus === 'loading'"
            :disabled="disabled || !mayReadTargets || directoryStatus === 'error'"
            :placeholder="t('actionMenuPlaceholder')"
            :aria-label="t('actionMenu')"
            @update:value="selectMenu"
          />
        </NFormItem>
        <p v-if="!mayReadTargets" class="m-0 text-12px leading-18px text-warning">
          {{ t("actionDirectoryForbidden") }}
        </p>
        <p v-else-if="directoryStatus === 'error'" role="alert" class="m-0 text-12px leading-18px text-warning">
          {{ t("actionDirectoryFailed") }}
          <NButton text type="primary" :disabled="disabled" @click="loadTargets">{{ t("retry") }}</NButton>
        </p>
        <p
          v-else-if="directoryStatus === 'loaded' && !targets.length"
          class="m-0 text-12px leading-18px text-base-text-3"
        >
          {{ t("actionDirectoryEmpty") }}
        </p>
        <p
          v-if="state.actionMenuId && !state.actionTarget && directoryStatus !== 'loading'"
          class="m-0 break-all text-12px leading-18px text-warning"
        >
          {{ t("actionTargetUnavailable", { id: state.actionMenuId }) }}
        </p>
        <div v-if="state.actionTarget" class="rounded-6px bg-theme-fill p-10px text-12px leading-18px text-base-text-2">
          <p class="m-0">{{ state.actionTarget.breadcrumb.join(" / ") }}</p>
          <p class="m-0 mt-4px break-all font-mono">{{ state.actionTarget.path }}</p>
        </div>
        <div v-for="parameter in parameters" :key="`${parameter.location}:${parameter.name}`" class="flex-col gap-4px">
          <label
            class="flex-y-center gap-6px text-13px font-500"
            :for="`announcement-action-${parameter.location}-${parameter.name}`"
          >
            {{ parameterLabel(parameter) }}
            <NTag v-if="parameter.required" size="small" type="warning">{{ t("actionParameterRequired") }}</NTag>
            <span v-else class="text-12px text-base-text-3">{{ t("actionParameterOptional") }}</span>
          </label>
          <NInput
            :value="(parameter.location === 'path' ? state.actionValues : state.actionQuery)[parameter.name] ?? ''"
            :disabled="disabled"
            :placeholder="parameter.example ?? parameter.defaultValue ?? ''"
            :input-props="{
              id: `announcement-action-${parameter.location}-${parameter.name}`,
              'aria-label': parameterLabel(parameter),
            }"
            @update:value="updateParameter(parameter, $event)"
          />
          <p class="m-0 text-12px leading-18px text-base-text-3">{{ parameterDescription(parameter) }}</p>
          <p v-if="parameter.example" class="m-0 text-12px leading-18px text-base-text-3">
            {{ t("actionParameterExample", { value: parameter.example }) }}
          </p>
          <p v-if="parameter.defaultValue" class="m-0 text-12px leading-18px text-base-text-3">
            {{ t("actionParameterDefault", { value: parameter.defaultValue }) }}
          </p>
        </div>
      </template>
      <template v-else-if="state.actionType === 'external'">
        <NFormItem :label="t('actionUrl')" :show-feedback="false">
          <NInput
            v-model:value="state.actionUrl"
            :disabled="disabled"
            :placeholder="t('actionUrlPlaceholder')"
            :input-props="{ 'aria-label': t('actionUrl') }"
          />
        </NFormItem>
        <p class="m-0 text-12px leading-18px text-base-text-3">{{ t("actionUrlHint") }}</p>
      </template>
      <template v-else>
        <NAlert type="warning" :show-icon="false">{{ t("actionLegacyHint") }}</NAlert>
        <NFormItem :label="t('actionRoute')" :show-feedback="false">
          <NInput
            v-model:value="state.model.actionRoute"
            :disabled="disabled"
            :input-props="{ 'aria-label': t('actionRoute') }"
          />
        </NFormItem>
        <NFormItem :label="t('actionParams')" :show-feedback="false">
          <NInput
            v-model:value="state.actionParams"
            type="textarea"
            :disabled="disabled"
            :input-props="{ 'aria-label': t('actionParams') }"
          />
        </NFormItem>
      </template>
      <NFormItem v-if="localizedLabels" :label="t('actionLabel')" :show-feedback="false" required>
        <div class="w-full">
          <div class="grid grid-cols-1 gap-12px sm:grid-cols-2">
            <div v-for="locale in notificationLocales" :key="locale" class="min-w-0">
              <label :for="`${labelId}-${locale}`" class="mb-6px flex flex-wrap items-center gap-6px text-12px">
                <span>{{ t(`localizedLanguages.${locale}`) }}</span>
                <NTag size="tiny" :bordered="false">{{
                  t(locale === state.localized.defaultLocale ? "localizedDefaultBadge" : "actionParameterOptional")
                }}</NTag>
                <span v-if="locale === state.localized.defaultLocale" class="text-error" aria-hidden="true">*</span>
              </label>
              <NInput
                v-model:value="state.actionLabels[locale]"
                :disabled="disabled"
                :maxlength="64"
                :count-graphemes="countAnnouncementCharacters"
                show-count
                :placeholder="
                  t(
                    locale === state.localized.defaultLocale
                      ? 'actionLabelPlaceholder'
                      : 'actionLabelOptionalPlaceholder',
                  )
                "
                :input-props="{
                  id: `${labelId}-${locale}`,
                  'aria-label': t('actionLabelLanguage', { locale: t(`localizedLanguages.${locale}`) }),
                  'aria-required': locale === state.localized.defaultLocale,
                }"
              />
            </div>
          </div>
          <p class="mb-0 mt-6px text-12px leading-18px text-base-text-3">{{ t("actionLocalizedLabelHint") }}</p>
        </div>
      </NFormItem>
      <NFormItem v-else :label="t('actionLabel')" :show-feedback="false">
        <NInput
          v-model:value="state.model.actionLabel"
          :disabled="disabled"
          :placeholder="t('actionLabelPlaceholder')"
          :input-props="{ 'aria-label': t('actionLabel') }"
        />
      </NFormItem>
      <p v-if="state.actionType === 'menu'" class="m-0 text-12px leading-18px text-base-text-3">
        {{ t("actionLabelHint") }}
      </p>
      <div class="flex flex-wrap gap-8px">
        <NButton :loading="previewLoading" :disabled="disabled || !mayPreview" @click="preview">{{
          t("actionValidate")
        }}</NButton>
        <NButton :loading="opening" :disabled="disabled || !resolved" @click="openTarget">{{
          t("actionOpen")
        }}</NButton>
      </div>
      <p class="m-0 text-12px leading-18px text-base-text-3">{{ t("actionValidationHint") }}</p>
      <p v-if="!mayPreview" class="m-0 text-12px leading-18px text-warning">{{ t("actionPreviewForbidden") }}</p>
      <p v-if="previewError" role="alert" class="m-0 text-12px leading-18px text-error">{{ previewError }}</p>
      <div v-if="resolved" role="status" class="flex-col gap-4px rounded-6px bg-theme-fill p-10px">
        <span class="text-12px font-500 text-success">{{ t("actionVerified") }}</span>
        <code class="break-all text-12px leading-18px">{{ resolvedDestination }}</code>
      </div>
    </template>
  </div>
</template>
