<script setup lang="ts">
  import { computed, reactive, ref, watch } from "vue"
  import { $t } from "@/locales"
  import {
    fetchCreatePermissionExtension,
    fetchGetBackendRouters,
    fetchGetPermissionCatalog,
    fetchUpdatePermissionExtension,
  } from "@/service/api"
  import { buildExtensionPayload, createEmptyExtensionForm, isExtensionFormComplete } from "./extension-form"

  defineOptions({ name: "ExtensionOperateDrawer" })

  interface Props {
    operateType: "add" | "edit"
    rowData?: Api.PermissionExtension.Extension | null
    /** 从"最近被拒"预填的接口绑定 */
    preset?: { code: string; routeKey: string } | null
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ submitted: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })

  const catalog = ref<Api.SystemManage.PermissionCatalog>({ resources: [], codes: [] })
  const routers = ref<Api.SystemManage.BackendRouter[]>([])
  const form = reactive(createEmptyExtensionForm())

  const isEdit = computed(() => props.operateType === "edit")
  const title = computed(() =>
    isEdit.value ? $t("page.manage.permissionExtension.edit") : $t("page.manage.permissionExtension.add"),
  )

  const kindOptions = (["route_binding", "depends", "custom_code"] as const).map((kind) => ({
    label: $t(`page.manage.permissionExtension.kindOptions.${kind}`),
    value: kind,
  }))
  const codeOptions = computed(() =>
    catalog.value.codes.map((item) => ({ label: `${item.label}（${item.code}）`, value: item.code })),
  )
  const resourceOptions = computed(() =>
    catalog.value.resources.map((item) => ({ label: `${item.label}（${item.key}）`, value: item.key })),
  )
  const routeOptions = computed(() =>
    routers.value.map((item) => ({ label: `${item.code}  ${item.name}`, value: item.code })),
  )

  async function loadOptions() {
    const [catalogResult, routerResult] = await Promise.all([fetchGetPermissionCatalog(), fetchGetBackendRouters()])
    if (catalogResult.data) catalog.value = catalogResult.data
    if (routerResult.data) routers.value = routerResult.data
  }

  function fillForm() {
    Object.assign(form, createEmptyExtensionForm())
    if (isEdit.value && props.rowData) {
      Object.assign(form, {
        kind: props.rowData.kind,
        code: props.rowData.code,
        routeKey: props.rowData.routeKey ?? "",
        dependsOn: props.rowData.dependsOn ?? "",
        resource: props.rowData.resource ?? "",
        label: props.rowData.label ?? "",
        abacAction: props.rowData.abacAction ?? "read",
        note: props.rowData.note,
      })
    } else if (props.preset) {
      Object.assign(form, { kind: "route_binding", code: props.preset.code, routeKey: props.preset.routeKey })
    }
  }

  async function handleSubmit() {
    if (isEdit.value && props.rowData) {
      const data: Api.PermissionExtension.ExtensionUpdate = { note: form.note }
      if (props.rowData.kind === "custom_code") Object.assign(data, { label: form.label, abacAction: form.abacAction })
      const { error } = await fetchUpdatePermissionExtension(props.rowData.id, data)
      if (error) return
      window.$message?.success($t("common.updateSuccess"))
    } else {
      const { error } = await fetchCreatePermissionExtension(buildExtensionPayload(form))
      if (error) return
      window.$message?.success($t("common.addSuccess"))
    }
    visible.value = false
    emit("submitted")
  }

  watch(visible, (value) => {
    if (!value) return
    fillForm()
    loadOptions()
  })
</script>

<template>
  <NDrawer v-model:show="visible" :width="560">
    <NDrawerContent :title="title" closable>
      <NForm :model="form" label-placement="top">
        <NAlert v-if="isEdit" type="info" :bordered="false" class="mb-16px">
          {{ $t("page.manage.permissionExtension.structureLocked") }}
        </NAlert>
        <NFormItem :label="$t('page.manage.permissionExtension.kind')" path="kind">
          <NRadioGroup v-model:value="form.kind" :disabled="isEdit">
            <NRadioButton v-for="item in kindOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </NRadioButton>
          </NRadioGroup>
        </NFormItem>

        <NFormItem v-if="form.kind === 'custom_code'" :label="$t('page.manage.permissionExtension.resource')">
          <NSelect
            v-model:value="form.resource"
            :options="resourceOptions"
            :disabled="isEdit"
            filterable
            :placeholder="$t('page.manage.permissionExtension.form.resource')"
          />
        </NFormItem>

        <NFormItem :label="$t('page.manage.permissionExtension.code')" path="code">
          <NInput
            v-if="form.kind === 'custom_code'"
            v-model:value="form.code"
            :disabled="isEdit"
            :placeholder="form.resource ? `${form.resource}:` : $t('page.manage.permissionExtension.form.code')"
          />
          <NSelect
            v-else
            v-model:value="form.code"
            :options="codeOptions"
            :disabled="isEdit"
            filterable
            :placeholder="$t('page.manage.permissionExtension.form.code')"
          />
        </NFormItem>

        <NFormItem v-if="form.kind === 'route_binding'" :label="$t('page.manage.permissionExtension.routeKey')">
          <NSelect
            v-model:value="form.routeKey"
            :options="routeOptions"
            :disabled="isEdit"
            filterable
            :placeholder="$t('page.manage.permissionExtension.form.routeKey')"
          />
        </NFormItem>

        <NFormItem v-if="form.kind === 'depends'" :label="$t('page.manage.permissionExtension.dependsOn')">
          <NSelect
            v-model:value="form.dependsOn"
            :options="codeOptions"
            :disabled="isEdit"
            filterable
            :placeholder="$t('page.manage.permissionExtension.form.dependsOn')"
          />
        </NFormItem>

        <template v-if="form.kind === 'custom_code'">
          <NFormItem :label="$t('page.manage.permissionExtension.label')">
            <NInput v-model:value="form.label" :placeholder="$t('page.manage.permissionExtension.form.label')" />
          </NFormItem>
          <NFormItem :label="$t('page.manage.permissionExtension.abacAction')">
            <NRadioGroup v-model:value="form.abacAction">
              <NRadio value="read">{{ $t("page.manage.permissionExtension.actionOptions.read") }}</NRadio>
              <NRadio value="write">{{ $t("page.manage.permissionExtension.actionOptions.write") }}</NRadio>
            </NRadioGroup>
          </NFormItem>
        </template>

        <NFormItem :label="$t('page.manage.permissionExtension.note')">
          <NInput
            v-model:value="form.note"
            type="textarea"
            :placeholder="$t('page.manage.permissionExtension.form.note')"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NButton type="primary" :disabled="!isEdit && !isExtensionFormComplete(form)" @click="handleSubmit">
          {{ $t("common.confirm") }}
        </NButton>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
