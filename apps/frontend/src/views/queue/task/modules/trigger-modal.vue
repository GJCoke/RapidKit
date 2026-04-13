<script setup lang="ts">
  import { ref, watch } from "vue"
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
  const argsStr = ref("[]")
  const kwargsStr = ref("{}")

  watch(visible, async (val) => {
    if (val) {
      const { data, error } = await fetchGetRegisteredTasks()
      if (!error) {
        registeredTasks.value = data.tasks
      }
    } else {
      taskName.value = null
      argsStr.value = "[]"
      kwargsStr.value = "{}"
    }
  })

  const taskOptions = ref<{ label: string; value: string }[]>([])
  watch(registeredTasks, (tasks) => {
    taskOptions.value = tasks.map((t) => ({ label: t, value: t }))
  })

  async function handleSubmit() {
    if (!taskName.value) return

    let args: unknown[]
    let kwargs: Record<string, unknown>

    try {
      args = JSON.parse(argsStr.value)
    } catch {
      window.$message?.error("args: Invalid JSON")
      return
    }

    try {
      kwargs = JSON.parse(kwargsStr.value)
    } catch {
      window.$message?.error("kwargs: Invalid JSON")
      return
    }

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
  <NModal v-model:show="visible" preset="card" :title="$t('page.manage.worker.triggerTask')" style="width: 520px">
    <NForm label-placement="left" :label-width="100">
      <NFormItem :label="$t('page.manage.worker.selectTask')">
        <NSelect
          v-model:value="taskName"
          :options="taskOptions"
          :placeholder="$t('page.manage.worker.selectTask')"
          filterable
        />
      </NFormItem>
      <NFormItem :label="$t('page.manage.worker.args')">
        <NInput
          v-model:value="argsStr"
          type="textarea"
          placeholder='[1, "hello"]'
          :autosize="{ minRows: 2, maxRows: 5 }"
        />
      </NFormItem>
      <NFormItem :label="$t('page.manage.worker.kwargs')">
        <NInput
          v-model:value="kwargsStr"
          type="textarea"
          placeholder='{"key": "value"}'
          :autosize="{ minRows: 2, maxRows: 5 }"
        />
      </NFormItem>
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
