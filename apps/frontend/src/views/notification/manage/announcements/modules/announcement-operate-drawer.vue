<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useAuth } from "@/hooks/business/auth"
  import { useNaiveForm } from "@/hooks/common/form"
  import {
    fetchCreateAnnouncement,
    fetchGetAnnouncement,
    fetchPreviewAudience,
    fetchPublishAnnouncement,
    fetchUpdateAnnouncement,
  } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({ name: "AnnouncementOperateDrawer" })

  const props = defineProps<{ messageId?: string | null }>()
  const emit = defineEmits<{ submitted: [] }>()
  const permissions = {
    preview: "POST:/api/v1/admin/notifications/{message_id}/audience-preview",
    publish: "POST:/api/v1/admin/notifications/{message_id}/publish",
  }
  const { hasAuth } = useAuth()
  const visible = defineModel<boolean>("visible", { default: false })
  const { formRef, validate, restoreValidation } = useNaiveForm()
  const model = ref(createDefaultModel())
  const contentMode = ref<"raw" | "i18n" | "template">("raw")
  const audiences = ref<Api.Notification.AudienceRule[]>([{ type: "all" }])
  const actionEnabled = ref(false)
  const actionParams = ref("{}")
  const savedMessageId = ref<string | null>(null)
  const previewTotal = ref<number | null>(null)
  const submitting = ref(false)
  const previewing = ref(false)
  const publishing = ref(false)

  const title = computed(() =>
    $t(`page.notification.manage.announcements.${props.messageId ? "edit" : "add"}` as I18nFullKey),
  )
  const levelOptions = ["info", "success", "warning", "error"].map((value) => ({
    label: $t(`page.notification.level.${value}` as I18nFullKey),
    value,
  }))
  const contentModeOptions = ["raw", "i18n", "template"].map((value) => ({
    label: $t(`page.notification.manage.announcements.contentModeOptions.${value}` as I18nFullKey),
    value,
  }))
  const audienceTypeKey = {
    all: "audienceAll",
    role: "audienceRole",
    department: "audienceDept",
    user: "audienceUser",
  } as const
  const typeOptions = Object.entries(audienceTypeKey).map(([value, key]) => ({
    label: $t(`page.notification.manage.announcements.${key}` as I18nFullKey),
    value,
  }))

  function createDefaultModel(): Api.Notification.AnnouncementCreate {
    return {
      category: "admin.announcement",
      level: "info",
      rawTitle: "",
      rawContent: "",
      rawFormat: "plain_text",
      audience: [{ type: "all" }],
      mandatory: false,
      channels: ["in_app"],
      publishAt: null,
      expireAt: null,
    }
  }

  function addAudience() {
    audiences.value.push({ type: "user", value: "", includeDescendants: false })
  }

  function removeAudience(index: number) {
    if (audiences.value.length > 1) audiences.value.splice(index, 1)
  }

  function buildPayload(): Api.Notification.AnnouncementUpdate | null {
    const audience = audiences.value.map((rule) => ({
      type: rule.type,
      includeDescendants: rule.type === "department" && Boolean(rule.includeDescendants),
      ...(rule.type === "all" ? {} : { value: rule.value?.trim() }),
    }))
    if (audience.some((rule) => rule.type !== "all" && !rule.value)) {
      window.$message?.error($t("page.notification.manage.announcements.audienceRequired" as I18nFullKey))
      return null
    }

    let action: Api.Notification.ActionRef | null = null
    if (actionEnabled.value) {
      try {
        const params = JSON.parse(actionParams.value) as Record<string, unknown>
        action = { route: model.value.action?.route ?? "", label: model.value.action?.label, params }
      } catch {
        window.$message?.error($t("page.notification.manage.announcements.actionParamsInvalid" as I18nFullKey))
        return null
      }
    }

    const common = {
      category: model.value.category ?? "admin.announcement",
      level: model.value.level ?? "info",
      audience,
      mandatory: Boolean(model.value.mandatory),
      channels: ["in_app"] as Api.Notification.Channel[],
      rawFormat: model.value.rawFormat ?? "plain_text",
      action,
      publishAt: model.value.publishAt,
      expireAt: model.value.expireAt,
    }
    if (contentMode.value === "i18n") {
      return { ...common, i18NKey: model.value.i18NKey, i18NParams: model.value.i18NParams ?? {} }
    }
    if (contentMode.value === "template") {
      return {
        ...common,
        templateCode: model.value.templateCode,
        templateVariables: model.value.templateVariables ?? {},
      }
    }
    return {
      ...common,
      rawTitle: model.value.rawTitle,
      rawContent: model.value.rawContent,
      rawFormat: model.value.rawFormat ?? "plain_text",
    }
  }

  async function save(): Promise<string | null> {
    if (submitting.value) return null
    await validate()
    const payload = buildPayload()
    if (!payload) return null
    submitting.value = true
    try {
      if (savedMessageId.value) {
        const { error } = await fetchUpdateAnnouncement(savedMessageId.value, payload)
        if (error) return null
      } else {
        const { data, error } = await fetchCreateAnnouncement(payload)
        if (error || !data) return null
        savedMessageId.value = data.messageId
      }
      window.$message?.success($t("page.notification.manage.announcements.draftSaved" as I18nFullKey))
      emit("submitted")
      return savedMessageId.value
    } finally {
      submitting.value = false
    }
  }

  async function preview() {
    const messageId = await save()
    const payload = buildPayload()
    if (!messageId || !payload) return
    previewing.value = true
    try {
      const { data, error } = await fetchPreviewAudience(messageId, payload.audience)
      if (!error && data) previewTotal.value = data.total
    } finally {
      previewing.value = false
    }
  }

  async function publish() {
    const messageId = await save()
    if (!messageId) return
    publishing.value = true
    try {
      const { error } = await fetchPublishAnnouncement(messageId)
      if (!error) {
        visible.value = false
        emit("submitted")
      }
    } finally {
      publishing.value = false
    }
  }

  async function initialize() {
    model.value = createDefaultModel()
    contentMode.value = "raw"
    audiences.value = [{ type: "all" }]
    savedMessageId.value = props.messageId ?? null
    previewTotal.value = null
    actionEnabled.value = false
    actionParams.value = "{}"
    void restoreValidation()
    if (!props.messageId) return
    const { data, error } = await fetchGetAnnouncement(props.messageId)
    if (error || !data) return
    contentMode.value = data.contentMode === "i18n" ? "i18n" : data.templateId ? "template" : "raw"
    audiences.value = data.audiences
    actionEnabled.value = Boolean(data.action)
    actionParams.value = JSON.stringify(data.action?.params ?? {})
    model.value = {
      category: data.category,
      level: data.level,
      rawTitle: contentMode.value === "raw" ? data.title : null,
      rawContent: contentMode.value === "raw" ? data.content : null,
      rawFormat: data.contentFormat ?? "plain_text",
      i18NKey: contentMode.value === "i18n" ? data.title : null,
      i18NParams: data.contentParams ?? {},
      templateCode: data.templateCode ?? undefined,
      templateVariables: data.contentParams ?? {},
      audience: data.audiences,
      mandatory: data.mandatory,
      channels: data.channels,
      action:
        data.action && typeof data.action.route === "string"
          ? {
              route: data.action.route,
              params: data.action.params as Record<string, unknown>,
              label: data.action.label as string | null,
            }
          : null,
      publishAt: data.publishAt,
      expireAt: data.expireAt,
    }
  }

  watch(visible, (shown) => shown && void initialize())
  watch(actionEnabled, (enabled) => {
    if (enabled && !model.value.action) model.value.action = { route: "notification_center", params: {} }
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="640">
    <NDrawerContent :title="title" closable :native-scrollbar="false">
      <NForm ref="formRef" :model="model" label-placement="top">
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :label="$t('page.notification.manage.announcements.category' as I18nFullKey)"
            ><NInput v-model:value="model.category"
          /></NFormItemGi>
          <NFormItemGi :label="$t('page.notification.manage.announcements.level' as I18nFullKey)"
            ><NSelect v-model:value="model.level" :options="levelOptions"
          /></NFormItemGi>
        </NGrid>
        <NFormItem :label="$t('page.notification.manage.announcements.contentMode' as I18nFullKey)"
          ><NSelect v-model:value="contentMode" :options="contentModeOptions"
        /></NFormItem>
        <template v-if="contentMode === 'raw'">
          <NFormItem :label="$t('page.notification.manage.announcements.title' as I18nFullKey)"
            ><NInput v-model:value="model.rawTitle"
          /></NFormItem>
          <NFormItem :label="$t('page.notification.manage.announcements.content' as I18nFullKey)"
            ><NInput v-model:value="model.rawContent" type="textarea" :rows="5"
          /></NFormItem>
        </template>
        <template v-else-if="contentMode === 'i18n'">
          <NFormItem :label="$t('page.notification.manage.announcements.i18nKey' as I18nFullKey)"
            ><NInput v-model:value="model.i18NKey"
          /></NFormItem>
        </template>
        <template v-else>
          <NFormItem :label="$t('page.notification.manage.announcements.templateCode' as I18nFullKey)"
            ><NInput v-model:value="model.templateCode"
          /></NFormItem>
        </template>

        <NFormItem :label="$t('page.notification.manage.announcements.audience' as I18nFullKey)">
          <div class="w-full flex-col gap-8px">
            <div v-for="(rule, index) in audiences" :key="index" class="flex-y-center gap-8px">
              <NSelect v-model:value="rule.type" class="w-140px" :options="typeOptions" />
              <NInput v-if="rule.type !== 'all'" v-model:value="rule.value" />
              <NCheckbox v-if="rule.type === 'department'" v-model:checked="rule.includeDescendants">{{
                $t("page.notification.manage.announcements.includeDescendants" as I18nFullKey)
              }}</NCheckbox>
              <NButton quaternary type="error" :disabled="audiences.length === 1" @click="removeAudience(index)"
                >−</NButton
              >
            </div>
            <NButton dashed block @click="addAudience"
              >+ {{ $t("page.notification.manage.announcements.addAudience" as I18nFullKey) }}</NButton
            >
          </div>
        </NFormItem>

        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :label="$t('page.notification.manage.announcements.publishAt' as I18nFullKey)"
            ><NDatePicker
              v-model:formatted-value="model.publishAt"
              type="datetime"
              value-format="yyyy-MM-dd'T'HH:mm:ss"
              clearable
              class="w-full"
          /></NFormItemGi>
          <NFormItemGi :label="$t('page.notification.manage.announcements.expireAt' as I18nFullKey)"
            ><NDatePicker
              v-model:formatted-value="model.expireAt"
              type="datetime"
              value-format="yyyy-MM-dd'T'HH:mm:ss"
              clearable
              class="w-full"
          /></NFormItemGi>
        </NGrid>
        <NFormItem :label="$t('page.notification.manage.announcements.mandatory' as I18nFullKey)"
          ><NSwitch v-model:value="model.mandatory"
        /></NFormItem>
        <NFormItem :label="$t('page.notification.manage.announcements.action' as I18nFullKey)"
          ><NSwitch v-model:value="actionEnabled"
        /></NFormItem>
        <template v-if="actionEnabled">
          <NFormItem :label="$t('page.notification.manage.announcements.actionRoute' as I18nFullKey)"
            ><NInput v-model:value="model.action!.route"
          /></NFormItem>
          <NFormItem :label="$t('page.notification.manage.announcements.actionParams' as I18nFullKey)"
            ><NInput v-model:value="actionParams" type="textarea" :rows="2"
          /></NFormItem>
        </template>
      </NForm>
      <div v-if="previewTotal !== null" class="mt-8px text-13px font-600 text-primary">
        {{ $t("page.notification.manage.announcements.previewResult" as I18nFullKey, { total: previewTotal }) }}
      </div>
      <template #footer>
        <NSpace>
          <NButton @click="visible = false">{{ $t("common.cancel") }}</NButton>
          <NButton v-if="hasAuth(permissions.preview)" :loading="previewing" @click="preview">{{
            $t("page.notification.manage.announcements.preview" as I18nFullKey)
          }}</NButton>
          <NButton type="primary" ghost :loading="submitting" @click="save">{{
            $t("page.notification.manage.announcements.saveDraft" as I18nFullKey)
          }}</NButton>
          <NButton
            v-if="hasAuth(permissions.publish)"
            type="primary"
            :loading="publishing"
            :disabled="Boolean(model.publishAt)"
            @click="publish"
            >{{ $t("page.notification.manage.announcements.publishNow" as I18nFullKey) }}</NButton
          >
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
