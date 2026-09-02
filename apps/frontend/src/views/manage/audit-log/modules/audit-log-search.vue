<script setup lang="ts">
  import { onMounted, ref, toRaw } from "vue"
  import type { SelectOption } from "naive-ui"
  import { jsonClone } from "@rapidkit/utils"
  import { useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { fetchGetAllUsers } from "@/service/api"

  defineOptions({ name: "AuditLogSearch" })

  const emit = defineEmits<{ search: [] }>()
  const model = defineModel<Api.SystemManage.AuditLogQuery>("model", { required: true })
  const defaultModel = jsonClone(toRaw(model.value))
  const userOptions = ref<SelectOption[]>([])
  const { formRef, restoreValidation } = useNaiveForm()

  const resultOptions: SelectOption[] = [
    { label: $t("page.manage.auditLog.result.success"), value: "success" },
    { label: $t("page.manage.auditLog.result.failure"), value: "failure" },
  ]

  async function loadUsers() {
    const { data, error } = await fetchGetAllUsers()
    if (error) return
    userOptions.value = data.map((user) => ({ label: `${user.name} (${user.username})`, value: user.id }))
  }

  async function reset() {
    await restoreValidation()
    Object.assign(model.value, defaultModel)
    emit("search")
  }

  onMounted(loadUsers)
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse>
      <NCollapseItem :title="$t('common.search')" name="audit-log-search">
        <NForm ref="formRef" :model="model" label-placement="left" :label-width="90">
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi span="24 s:12 m:6" :label="$t('page.manage.auditLog.actor')" path="actorId" class="pr-24px">
              <NSelect
                v-model:value="model.actorId"
                :options="userOptions"
                :placeholder="$t('page.manage.auditLog.form.actor')"
                clearable
                filterable
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:6" :label="$t('page.manage.auditLog.action')" path="action" class="pr-24px">
              <NInput v-model:value="model.action" :placeholder="$t('page.manage.auditLog.form.action')" clearable />
            </NFormItemGi>
            <NFormItemGi
              span="24 s:12 m:6"
              :label="$t('page.manage.auditLog.resultLabel')"
              path="result"
              class="pr-24px"
            >
              <NSelect
                v-model:value="model.result"
                :options="resultOptions"
                :placeholder="$t('page.manage.auditLog.form.result')"
                clearable
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:6" class="pr-24px">
              <NSpace class="w-full" justify="end">
                <NButton @click="reset">
                  <template #icon><icon-ic-round-refresh class="text-icon" /></template>
                  {{ $t("common.reset") }}
                </NButton>
                <NButton type="primary" ghost @click="emit('search')">
                  <template #icon><icon-ic-round-search class="text-icon" /></template>
                  {{ $t("common.search") }}
                </NButton>
              </NSpace>
            </NFormItemGi>
          </NGrid>
        </NForm>
      </NCollapseItem>
    </NCollapse>
  </NCard>
</template>
