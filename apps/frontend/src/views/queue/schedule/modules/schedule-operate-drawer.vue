<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { jsonClone } from "@monorepo-example/utils"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"
  import { fetchCreateSchedule, fetchGetRegisteredTasks, fetchUpdateSchedule } from "@/service/api/worker"

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

  // 调度类型选项
  type ScheduleType = "interval" | "crontab"
  const scheduleType = ref<ScheduleType>("interval")

  // 周期选项
  const periodOptions = [
    { label: $t("page.manage.worker.schedule.periodOptions.seconds"), value: "seconds" },
    { label: $t("page.manage.worker.schedule.periodOptions.minutes"), value: "minutes" },
    { label: $t("page.manage.worker.schedule.periodOptions.hours"), value: "hours" },
    { label: $t("page.manage.worker.schedule.periodOptions.days"), value: "days" },
    { label: $t("page.manage.worker.schedule.periodOptions.weeks"), value: "weeks" },
  ]

  // 表单模型
  interface FormModel {
    name: string
    task: string | null
    description: string
    enabled: boolean
    intervalEvery: number
    intervalPeriod: string
    crontabMinute: string
    crontabHour: string
    crontabDayOfWeek: string
    crontabDayOfMonth: string
    crontabMonthOfYear: string
  }

  const model = ref<FormModel>(createDefaultModel())

  function createDefaultModel(): FormModel {
    return {
      name: "",
      task: null,
      description: "",
      enabled: true,
      intervalEvery: 60,
      intervalPeriod: "seconds",
      crontabMinute: "*",
      crontabHour: "*",
      crontabDayOfWeek: "*",
      crontabDayOfMonth: "*",
      crontabMonthOfYear: "*",
    }
  }

  const rules: Record<string, App.Global.FormRule> = {
    name: defaultRequiredRule,
    task: defaultRequiredRule,
  }

  function handleInitModel() {
    model.value = createDefaultModel()

    if (props.operateType === "edit" && props.rowData) {
      const row = jsonClone(props.rowData)
      model.value.name = row.name
      model.value.task = row.task
      model.value.description = row.description
      model.value.enabled = row.enabled

      if (row.taskType === "interval" && row.interval) {
        scheduleType.value = "interval"
        model.value.intervalEvery = row.interval.every
        model.value.intervalPeriod = row.interval.period
      } else if (row.taskType === "crontab" && row.crontab) {
        scheduleType.value = "crontab"
        model.value.crontabMinute = row.crontab.minute
        model.value.crontabHour = row.crontab.hour
        model.value.crontabDayOfWeek = row.crontab.dayOfWeek
        model.value.crontabDayOfMonth = row.crontab.dayOfMonth
        model.value.crontabMonthOfYear = row.crontab.monthOfYear
      }
    } else {
      scheduleType.value = "interval"
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  async function handleSubmit() {
    await validate()

    const baseData = {
      name: model.value.name,
      task: model.value.task!,
      taskType: scheduleType.value as Api.Worker.ScheduleType,
      enabled: model.value.enabled,
      description: model.value.description,
    }

    const scheduleConfig =
      scheduleType.value === "interval"
        ? {
            interval: {
              every: model.value.intervalEvery,
              period: model.value.intervalPeriod,
            },
            crontab: null,
          }
        : {
            interval: null,
            crontab: {
              minute: model.value.crontabMinute,
              hour: model.value.crontabHour,
              dayOfWeek: model.value.crontabDayOfWeek,
              dayOfMonth: model.value.crontabDayOfMonth,
              monthOfYear: model.value.crontabMonthOfYear,
            },
          }

    if (props.operateType === "add") {
      const { error } = await fetchCreateSchedule({ ...baseData, ...scheduleConfig })
      if (error) return
    } else if (props.rowData) {
      const { error } = await fetchUpdateSchedule(props.rowData.id, { ...baseData, ...scheduleConfig })
      if (error) return
    }

    window.$message?.success($t("common.updateSuccess"))
    closeDrawer()
    emit("submitted")
  }

  watch(visible, () => {
    if (visible.value) {
      handleInitModel()
      restoreValidation()
      loadRegisteredTasks()
    }
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="480">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules">
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

        <NFormItem :label="$t('page.manage.worker.schedule.scheduleType')">
          <NRadioGroup v-model:value="scheduleType">
            <NRadio value="interval">{{ $t("page.manage.worker.schedule.interval") }}</NRadio>
            <NRadio value="crontab">{{ $t("page.manage.worker.schedule.crontab") }}</NRadio>
          </NRadioGroup>
        </NFormItem>

        <!-- Interval 配置 -->
        <template v-if="scheduleType === 'interval'">
          <NFormItem :label="$t('page.manage.worker.schedule.every')" path="intervalEvery">
            <NInputNumber v-model:value="model.intervalEvery" :min="1" class="w-full" />
          </NFormItem>
          <NFormItem :label="$t('page.manage.worker.schedule.period')" path="intervalPeriod">
            <NSelect v-model:value="model.intervalPeriod" :options="periodOptions" />
          </NFormItem>
        </template>

        <!-- Crontab 配置 -->
        <template v-if="scheduleType === 'crontab'">
          <NFormItem :label="$t('page.manage.worker.schedule.form.minute')" path="crontabMinute">
            <NInput v-model:value="model.crontabMinute" placeholder="*" />
          </NFormItem>
          <NFormItem :label="$t('page.manage.worker.schedule.form.hour')" path="crontabHour">
            <NInput v-model:value="model.crontabHour" placeholder="*" />
          </NFormItem>
          <NFormItem :label="$t('page.manage.worker.schedule.form.dayOfWeek')" path="crontabDayOfWeek">
            <NInput v-model:value="model.crontabDayOfWeek" placeholder="*" />
          </NFormItem>
          <NFormItem :label="$t('page.manage.worker.schedule.form.dayOfMonth')" path="crontabDayOfMonth">
            <NInput v-model:value="model.crontabDayOfMonth" placeholder="*" />
          </NFormItem>
          <NFormItem :label="$t('page.manage.worker.schedule.form.monthOfYear')" path="crontabMonthOfYear">
            <NInput v-model:value="model.crontabMonthOfYear" placeholder="*" />
          </NFormItem>
        </template>
      </NForm>

      <template #footer>
        <NSpace :size="16">
          <NButton @click="closeDrawer">{{ $t("common.cancel") }}</NButton>
          <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
