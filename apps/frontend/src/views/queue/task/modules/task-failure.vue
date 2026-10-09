<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { $t } from "@/locales"
  import LogViewer from "@/components/common/log-viewer/index.vue"
  import { copyText } from "@/utils/text-actions"

  defineOptions({ name: "TaskFailure" })
  const props = defineProps<{ taskId: string; status: string; exception?: string | null; traceback?: string | null }>()
  const hasMessage = computed(() => Boolean(props.exception?.trim()))
  const hasTraceback = computed(() => Boolean(props.traceback?.trim()))
  const show = computed(() => props.status === "4" || hasMessage.value || hasTraceback.value)
  const stackOpen = ref(false)
  const feedback = ref<"exceptionCopied" | "exceptionCopyFailed" | "">("")
  const copying = ref(false)
  let revision = 0
  watch(
    () => [props.taskId, props.exception, props.traceback],
    () => {
      revision++
      feedback.value = ""
      stackOpen.value = false
    },
  )
  async function copyException() {
    const current = revision
    copying.value = true
    feedback.value = ""
    try {
      await copyText(props.exception ?? "")
      if (current === revision) feedback.value = "exceptionCopied"
    } catch {
      if (current === revision) feedback.value = "exceptionCopyFailed"
    } finally {
      copying.value = false
    }
  }
  function toggleStack(event: Event) {
    stackOpen.value = (event.target as HTMLDetailsElement).open
  }
</script>

<template>
  <section v-if="show" class="flex-col-stretch gap-10px min-w-0" :aria-label="$t('page.manage.worker.exception')">
    <NAlert type="error" :bordered="false" :title="$t('page.manage.worker.exception')">
      <div class="flex-col-stretch gap-10px min-w-0">
        <div class="exception-message whitespace-pre-wrap text-13px">
          {{
            hasMessage
              ? exception
              : $t(hasTraceback ? "page.manage.worker.noExceptionMessage" : "page.manage.worker.noExceptionDetails")
          }}
        </div>
        <div v-if="hasMessage" class="flex-y-center flex-wrap gap-8px">
          <NButton
            size="small"
            :loading="copying"
            :aria-label="$t('page.manage.worker.copyException')"
            @click="copyException"
            >{{ $t("page.manage.worker.copyException") }}</NButton
          >
          <span v-if="feedback" :role="feedback === 'exceptionCopied' ? 'status' : 'alert'" class="text-12px">{{
            $t(`page.manage.worker.${feedback}`)
          }}</span>
        </div>
      </div>
    </NAlert>
    <details v-if="hasTraceback" :open="stackOpen" class="min-w-0" @toggle="toggleStack">
      <summary class="cursor-pointer py-8px text-13px font-600">{{ $t("page.manage.worker.traceback") }}</summary>
      <LogViewer
        v-if="stackOpen"
        :key="`${taskId}-traceback`"
        :records="[{ id: taskId, message: traceback ?? '', level: 'ERROR' }]"
        :source-key="taskId"
        :title="$t('page.manage.worker.traceback')"
        :filename="`task-${taskId}-traceback.log`"
        :height="240"
        class="mt-4px"
      />
    </details>
  </section>
</template>

<style scoped>
  .exception-message {
    overflow-wrap: anywhere;
  }
  @media (pointer: coarse) {
    summary {
      min-height: 44px;
    }
  }
</style>
