<script setup lang="ts">
  import { computed } from "vue"
  import dayjs from "dayjs"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import TemplateStatus from "./template-status.vue"
  import { templateListText as t, templateModeLabel } from "./template-presentation"
  import { renderTemplatePreview } from "./template-preview"
  import { schemaToRows } from "./template-editor"

  defineOptions({ name: "TemplateDetailPanel" })
  const props = defineProps<{
    template: Api.Notification.Template | null
    canEdit: boolean
    canDelete: boolean
    deleting: boolean
  }>()
  const emit = defineEmits<{ edit: [id: string]; delete: [template: Api.Notification.Template] }>()
  const themeVars = useThemeVars()
  const parameters = computed(() => schemaToRows(props.template?.variableSchema ?? {}))
  const preview = computed(() => (props.template ? renderTemplatePreview(props.template, parameters.value) : null))
  const updatedAt = computed(() => {
    const value = props.template?.updateTime
    return value && dayjs(value).isValid() ? dayjs(value).format("YYYY-MM-DD HH:mm") : t("notSet")
  })
  const preference = computed(() => {
    if (props.template?.mandatory) return t("mandatoryPreference")
    if (["admin.announcement", "system.security"].includes(props.template?.category ?? ""))
      return t("reservedPreference")
    return t("respectPreferences")
  })
  const moreOptions = computed(() => (props.canDelete ? [{ label: $t("common.delete"), key: "delete" }] : []))

  function parameterType(rule: Record<string, unknown>) {
    const type = typeof rule.type === "string" ? rule.type : "string"
    return ["string", "integer", "number", "boolean"].includes(type)
      ? $t(`page.notification.manage.templates.editor.types.${type}` as I18nFullKey)
      : type
  }
  function handleMore(key: string) {
    if (key === "delete" && props.template && props.canDelete && !props.deleting) emit("delete", props.template)
  }
</script>

<template>
  <section
    id="template-details"
    :aria-label="t('detail')"
    :style="{ '--border-color': themeVars.dividerColor }"
    class="min-w-0 flex-col-stretch gap-24px text-14px"
  >
    <h2 class="m-0 text-16px font-600 text-base-text-1">{{ t("detail") }}</h2>
    <template v-if="template">
      <header class="min-w-0">
        <div class="flex flex-wrap items-start justify-between gap-12px">
          <div class="min-w-0 flex-1">
            <h3 class="m-0 break-words text-20px font-600 leading-28px text-base-text-1">{{ template.name }}</h3>
            <p class="m-0 mt-6px break-all font-mono text-12px text-base-text-3">{{ template.code }}</p>
          </div>
          <div v-if="canEdit || canDelete" class="flex items-center gap-8px">
            <NButton v-if="canEdit" size="small" type="primary" ghost @click="emit('edit', template.id)">
              <template #icon><SvgIcon icon="carbon:edit" /></template>
              {{ $t("page.notification.manage.templates.edit" as I18nFullKey) }}
            </NButton>
            <NDropdown
              v-if="canDelete"
              trigger="click"
              placement="bottom-end"
              :options="moreOptions"
              @select="handleMore"
            >
              <NButton :aria-label="t('more')" :title="t('more')" size="small" :loading="deleting" :disabled="deleting">
                <SvgIcon icon="carbon:overflow-menu-horizontal" />
              </NButton>
            </NDropdown>
          </div>
        </div>
        <p class="m-0 mt-8px text-12px text-base-text-3">{{ t("updatedAt", { time: updatedAt }) }}</p>
      </header>

      <section class="border-t border-theme-default pt-24px">
        <h3 class="m-0 text-15px font-600 text-base-text-1">{{ t("content") }}</h3>
        <p class="m-0 mt-6px text-12px text-base-text-3">
          {{ templateModeLabel(template.contentMode) }}
          <template v-if="template.contentMode === 'raw'">
            · {{ t(template.contentFormat === "markdown" ? "markdown" : "plainText") }}</template
          >
        </p>
        <dl class="m-0 mt-18px flex-col-stretch gap-18px">
          <div>
            <dt class="mb-6px text-12px text-base-text-3">
              {{
                template.contentMode === "raw"
                  ? t("title")
                  : $t("page.notification.manage.templates.editor.titleKey" as I18nFullKey)
              }}
            </dt>
            <dd
              class="m-0 whitespace-pre-wrap break-words leading-24px text-base-text-1"
              :class="{ 'font-mono text-13px': template.contentMode === 'i18n' }"
            >
              {{ template.titleTemplate }}
            </dd>
          </div>
          <div>
            <dt class="mb-6px text-12px text-base-text-3">
              {{
                template.contentMode === "raw"
                  ? t("body")
                  : $t("page.notification.manage.templates.editor.contentKey" as I18nFullKey)
              }}
            </dt>
            <dd
              class="m-0 whitespace-pre-wrap break-words leading-24px text-base-text-1"
              :class="{ 'font-mono text-13px': template.contentMode === 'i18n' }"
            >
              {{ template.contentTemplate }}
            </dd>
          </div>
        </dl>
        <section
          v-if="preview"
          :aria-label="t('preview')"
          class="mt-20px rounded-6px border border-theme-default bg-primary/5 p-14px"
        >
          <h4 class="m-0 flex items-center gap-6px text-12px font-500 text-primary">
            <SvgIcon icon="carbon:notification" />
            {{ t("preview") }}
          </h4>
          <p class="mb-0 mt-12px whitespace-pre-wrap break-words text-14px font-600 leading-22px text-base-text-1">
            {{ preview.title || t("emptyPreviewTitle") }}
          </p>
          <p class="mb-0 mt-6px whitespace-pre-wrap break-words text-13px leading-22px text-base-text-2">
            {{ preview.content || t("emptyPreviewBody") }}
          </p>
          <ul
            v-if="preview.issues.length"
            aria-live="polite"
            class="mb-0 mt-10px list-disc pl-18px text-12px leading-20px text-warning"
          >
            <li v-for="issue in preview.issues" :key="issue">{{ issue }}</li>
          </ul>
          <p class="mb-0 mt-12px text-12px leading-20px text-base-text-3">{{ t("previewHint") }}</p>
        </section>
      </section>

      <section class="border-t border-theme-default pt-24px">
        <h3 class="m-0 text-15px font-600 text-base-text-1">{{ t("parameters") }}</h3>
        <p class="m-0 mt-6px text-12px text-base-text-3">{{ t("parameterHint") }}</p>
        <div v-if="parameters.length" class="mt-16px overflow-x-auto rounded-6px border border-theme-default">
          <table class="w-full min-w-420px table-fixed border-collapse text-left text-13px">
            <thead class="bg-layout text-base-text-2">
              <tr>
                <th class="w-30% px-12px py-8px font-500" scope="col">{{ t("parameter") }}</th>
                <th class="w-64px px-8px py-8px font-500" scope="col">
                  {{ $t("page.notification.manage.templates.editor.variableType" as I18nFullKey) }}
                </th>
                <th class="w-64px px-8px py-8px font-500" scope="col">{{ t("requirement") }}</th>
                <th class="px-12px py-8px font-500" scope="col">{{ t("exampleValue") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in parameters" :key="row.id" class="border-t border-theme-default">
                <td class="px-12px py-8px align-top leading-20px">
                  <code class="break-all text-base-text-1">{{ row.name }}</code>
                </td>
                <td class="break-words px-8px py-8px align-top text-12px leading-20px text-base-text-3">
                  {{ parameterType(row.rule) }}
                </td>
                <td class="whitespace-nowrap px-8px py-8px align-top text-12px leading-20px text-base-text-3">
                  {{ t(row.required ? "required" : "optional") }}
                </td>
                <td class="break-words px-12px py-8px align-top leading-20px text-base-text-2">
                  <span class="whitespace-pre-wrap">{{ row.example || t("notSet") }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="m-0 mt-16px text-13px text-base-text-3">{{ t("noParameters") }}</p>
      </section>

      <section class="border-t border-theme-default pt-24px">
        <h3 class="m-0 text-15px font-600 text-base-text-1">{{ t("rules") }}</h3>
        <dl class="m-0 mt-16px grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-12px gap-y-14px text-13px">
          <dt class="text-base-text-3">{{ t("channel") }}</dt>
          <dd class="m-0 break-words text-base-text-2">
            {{
              template.defaultChannels.length
                ? template.defaultChannels.map((channel) => (channel === "in_app" ? t("inApp") : channel)).join("、")
                : t("noChannels")
            }}
          </dd>
          <dt class="text-base-text-3">{{ t("preference") }}</dt>
          <dd class="m-0 break-words leading-20px text-base-text-2">{{ preference }}</dd>
          <dt class="text-base-text-3">{{ t("status") }}</dt>
          <dd class="m-0"><TemplateStatus :enabled="template.enabled" /></dd>
        </dl>
        <p class="m-0 mt-20px flex items-start gap-6px text-12px leading-20px text-base-text-3">
          <SvgIcon icon="carbon:information" class="mt-3px shrink-0" />
          {{ t(canEdit ? "editHint" : "readOnlyHint") }}
        </p>
      </section>
    </template>
    <NEmpty v-else class="py-70px" :description="t('emptyTitle')">
      <template #extra
        ><p class="m-0 text-13px text-base-text-3">{{ t("emptyHint") }}</p></template
      >
    </NEmpty>
  </section>
</template>
