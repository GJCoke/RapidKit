<script setup lang="ts">
  import { ref, watch } from "vue"
  import PythonArgumentsEditor from "@/components/common/python-arguments-editor/index.vue"
  import type { PythonArguments } from "@/components/common/python-arguments-editor/arguments"
  import { fetchGetRegisteredTasks, fetchTriggerTask } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({
    name: "TriggerModal",
  })

  interface Emits {
    (e: "submitted"): void
  }

  const emit = defineEmits<Emits>()
  const visible = defineModel<boolean>("visible", { default: false })

  const loading = ref(false)
  const registeredTasks = ref<string[]>([])

  const taskName = ref<string | null>(null)
  const argumentsModel = ref<PythonArguments>({ args: [], kwargs: {} })
  const argumentsRef = ref<InstanceType<typeof PythonArgumentsEditor> | null>(null)

  watch(visible, async (val) => {
    if (val) {
      const { data, error } = await fetchGetRegisteredTasks()
      if (!error) {
        registeredTasks.value = data.tasks
      }
    } else {
      taskName.value = null
      argumentsModel.value = { args: [], kwargs: {} }
    }
  })

  const taskOptions = ref<{ label: string; value: string }[]>([])
  watch(registeredTasks, (tasks) => {
    taskOptions.value = tasks.map((t) => ({ label: t, value: t }))
  })

  async function handleSubmit() {
    if (!taskName.value) return

    if (!argumentsRef.value?.validate()) return
    const { args, kwargs } = argumentsModel.value

    loading.value = true
    const { error } = await fetchTriggerTask({
      taskName: taskName.value,
      args,
      kwargs,
    })
    loading.value = false

    if (!error) {
      window.$message?.success($t("page.manage.worker.triggerSuccess"))
      visible.value = false
      emit("submitted")
    }
  }
</script>

<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :title="$t('page.manage.worker.triggerTask')"
    style="width: 640px; max-width: calc(100vw - 32px)"
  >
    <NForm label-placement="left" :label-width="100">
      <NFormItem :label="$t('page.manage.worker.selectTask')">
        <NSelect
          v-model:value="taskName"
          :options="taskOptions"
          :placeholder="$t('page.manage.worker.selectTask')"
          filterable
        />
      </NFormItem>
      <PythonArgumentsEditor
        ref="argumentsRef"
        v-model="argumentsModel"
        :function-name="taskName || 'task'"
        :disabled="loading"
      />
    </NForm>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="visible = false">{{ $t("common.cancel") }}</NButton>
        <NButton type="primary" :loading="loading" :disabled="!taskName" @click="handleSubmit">
          {{ $t("page.manage.worker.triggerTask") }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>
