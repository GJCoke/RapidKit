<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import PythonArgumentsEditor from "@/components/common/python-arguments-editor/index.vue"
  import type { PythonArguments } from "@/components/common/python-arguments-editor/arguments"
  import ScheduleEditor from "@/components/common/schedule-editor/index.vue"
  import { defaultSchedule, isCompleteSchedule } from "@/components/common/schedule-editor/schedule"
  import type { ScheduleValue } from "@/components/common/schedule-editor/schedule"
  import { jsonClone } from "@rapidkit/utils"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import {
    fetchCreateSchedule,
    fetchGetScheduleDetail,
    fetchGetRegisteredTasks,
    fetchUpdateSchedule,
    fetchGetSchedulePreview,
  } from "@/service/api/worker"

  defineOptions({
    name: "ScheduleOperateDrawer",
  })

  interface Props {
    operateType: NaiveUI.TableOperateType
    rowData?: Api.Worker.PeriodicTaskListItem | null
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "submitted"): void
  }

  const emit = defineEmits<Emits>()

  const visible = defineModel<boolean>("visible", {
    default: false,
  })

  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const title = computed(() => {
    const titles: Record<NaiveUI.TableOperateType, string> = {
      add: $t("page.manage.worker.schedule.addSchedule"),
      edit: $t("page.manage.worker.schedule.editSchedule"),
    }
    return titles[props.operateType]
  })

  // 已注册任务列表
  const registeredTasks = ref<{ label: string; value: string }[]>([])

  async function loadRegisteredTasks() {
    const { data, error } = await fetchGetRegisteredTasks()
    if (!error && data) {
      registeredTasks.value = data.tasks.map((t) => ({ label: t, value: t }))
    }
  }

  // 表单模型
  interface FormModel {
    name: string
    task: string | null
    description: string
    enabled: boolean
  }

  const model = ref<FormModel>(createDefaultModel())
  const scheduleModel = ref<ScheduleValue>(defaultSchedule("interval"))
  const scheduleRef = ref<InstanceType<typeof ScheduleEditor> | null>(null)
  const argumentsModel = ref<PythonArguments>({ args: [], kwargs: {} })
  const argumentsRef = ref<InstanceType<typeof PythonArgumentsEditor> | null>(null)
  const argumentsLoading = ref(false)
  const argumentsLoadFailed = ref(false)
  const submitting = ref(false)
  let detailRequest = 0

  async function loadSchedulePreview(value: ScheduleValue) {
    if (!isCompleteSchedule(value)) return null
    const { data, error } = await fetchGetSchedulePreview({ schedule: value })
    return error || !data ? null : { ...data, nextRuns: data.nextRuns ?? [] }
  }

  async function loadArguments() {
    const request = ++detailRequest
    argumentsModel.value = { args: [], kwargs: {} }
    argumentsLoadFailed.value = false
    argumentsLoading.value = props.operateType === "edit"
    if (props.operateType !== "edit" || !props.rowData) {
      argumentsLoading.value = false
      return
    }
    try {
      const { data, error } = await fetchGetScheduleDetail(props.rowData.id)
      if (request !== detailRequest || !visible.value) return
      if (error || !data) {
        argumentsLoadFailed.value = true
        return
      }
      argumentsModel.value = { args: data.args, kwargs: data.kwargs }
      scheduleModel.value = { ...data.schedule }
    } catch {
      if (request === detailRequest) argumentsLoadFailed.value = true
    } finally {
      if (request === detailRequest) argumentsLoading.value = false
    }
  }

  function createDefaultModel(): FormModel {
    return {
      name: "",
      task: null,
      description: "",
      enabled: true,
    }
  }

  const rules: Record<string, App.Global.FormRule> = {
    name: defaultRequiredRule,
    task: defaultRequiredRule,
  }

  function handleInitModel() {
    model.value = createDefaultModel()
    scheduleModel.value = defaultSchedule("interval")

    if (props.operateType === "edit" && props.rowData) {
      const row = jsonClone(props.rowData)
      model.value.name = row.name
      model.value.task = row.task
      model.value.description = row.description
      model.value.enabled = row.enabled

      scheduleModel.value = { ...row.schedule }
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  async function handleSubmit() {
    if (submitting.value) return
    submitting.value = true
    try {
      await submitSchedule()
    } finally {
      submitting.value = false
    }
  }

  async function submitSchedule() {
    const operation = detailRequest
    if (argumentsLoading.value || argumentsLoadFailed.value) return
    await validate()
    if (!argumentsRef.value?.validate()) return
    if (!(await scheduleRef.value?.validate()) || !isCompleteSchedule(scheduleModel.value)) return
    if (!visible.value || operation !== detailRequest) return

    const baseData = {
      name: model.value.name,
      task: model.value.task!,
      schedule: scheduleModel.value,
      enabled: model.value.enabled,
      description: model.value.description,
      args: argumentsModel.value.args,
      kwargs: argumentsModel.value.kwargs,
    }

    if (props.operateType === "add") {
      const { error } = await fetchCreateSchedule(baseData)
      if (error) return
    } else if (props.rowData) {
      const { error } = await fetchUpdateSchedule(props.rowData.id, {
        ...baseData,
      })
      if (error) return
    }

    window.$message?.success($t("common.updateSuccess"))
    closeDrawer()
    emit("submitted")
  }

  watch([visible, () => props.rowData?.id, () => props.operateType], () => {
    if (visible.value) {
      handleInitModel()
      loadArguments()
      restoreValidation()
      loadRegisteredTasks()
    } else {
      detailRequest++
    }
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" width="min(640px, 100vw)">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules" :disabled="submitting">
        <NFormItem :label="$t('page.manage.worker.schedule.name')" path="name">
          <NInput v-model:value="model.name" :placeholder="$t('page.manage.worker.schedule.form.name')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.worker.schedule.task')" path="task">
          <NSelect
            v-model:value="model.task"
            :options="registeredTasks"
            :placeholder="$t('page.manage.worker.schedule.form.task')"
            filterable
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.worker.schedule.description')" path="description">
          <NInput
            v-model:value="model.description"
            type="textarea"
            :placeholder="$t('page.manage.worker.schedule.form.description')"
            :rows="2"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.worker.schedule.enabled')" path="enabled">
          <NSwitch v-model:value="model.enabled" />
        </NFormItem>

        <NDivider />
        <NAlert v-if="argumentsLoadFailed" type="error" class="mb-16px">{{
          $t("page.manage.worker.argumentsLoadFailed")
        }}</NAlert>
        <NSpin :show="argumentsLoading">
          <PythonArgumentsEditor
            ref="argumentsRef"
            v-model="argumentsModel"
            :function-name="model.task || 'task'"
            :disabled="argumentsLoading || argumentsLoadFailed || submitting"
          />
        </NSpin>
        <NDivider />

        <ScheduleEditor
          ref="scheduleRef"
          v-model="scheduleModel"
          :load-preview="loadSchedulePreview"
          :disabled="argumentsLoading || argumentsLoadFailed || submitting"
        />
      </NForm>

      <template #footer>
        <NSpace :size="16">
          <NButton @click="closeDrawer">{{ $t("common.cancel") }}</NButton>
          <NButton
            type="primary"
            :loading="submitting"
            :disabled="argumentsLoading || argumentsLoadFailed || submitting"
            @click="handleSubmit"
            >{{ $t("common.confirm") }}</NButton
          >
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
