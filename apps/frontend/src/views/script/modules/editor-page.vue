<script setup lang="ts">
  import { ref, computed, watch } from "vue"
  import { MonacoEditor, OutputPanel } from "@rapidkit/editor"
  import type { OutputStatus } from "@rapidkit/editor"
  import { useThemeStore } from "@/store/modules/theme"
  import { $t } from "@/locales"
  import { fetchExecuteScript, fetchGetScriptDetail, fetchUpdateScript } from "@/service/api"
  import { useAuth } from "@/hooks/business/auth"

  defineOptions({
    name: "EditorPage",
  })

  interface Props {
    scriptId: string
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "back"): void
  }

  const emit = defineEmits<Emits>()

  const themeStore = useThemeStore()
  const { hasAuth } = useAuth()
  const editorTheme = computed(() => (themeStore.darkMode ? "vs-dark" : "vs"))

  const scriptData = ref<Api.Script.ScriptDetail | null>(null)
  const code = ref("")
  const loading = ref(false)
  const saving = ref(false)

  const execStatus = ref<OutputStatus>("idle")
  const execOutput = ref("")
  const execError = ref<string | null>(null)
  const execRuntime = ref<number | null>(null)

  async function fetchDetail() {
    loading.value = true
    const { data, error } = await fetchGetScriptDetail(props.scriptId)
    loading.value = false

    if (error) return

    scriptData.value = data
    code.value = data.code || ""
  }

  async function handleSave() {
    if (!scriptData.value || saving.value) return

    saving.value = true
    const { error } = await fetchUpdateScript(props.scriptId, {
      name: scriptData.value.name,
      description: scriptData.value.description,
      language: scriptData.value.language as Api.Script.ScriptLanguage,
      code: code.value,
      status: scriptData.value.status ?? undefined,
    })
    saving.value = false

    if (error) return

    window.$message?.success($t("common.updateSuccess"))
  }

  async function handleRun() {
    if (!scriptData.value) return

    // Save first to ensure backend has latest code
    saving.value = true
    const { error: saveError } = await fetchUpdateScript(props.scriptId, {
      name: scriptData.value.name,
      description: scriptData.value.description,
      language: scriptData.value.language as Api.Script.ScriptLanguage,
      code: code.value,
      status: scriptData.value.status ?? undefined,
    })
    saving.value = false

    if (saveError) return

    // Execute
    execStatus.value = "running"
    execOutput.value = ""
    execError.value = null
    execRuntime.value = null

    const { data, error } = await fetchExecuteScript(props.scriptId)

    if (error) {
      execStatus.value = "error"
      return
    }

    execOutput.value = data.stdout || ""
    execError.value = data.stderr
    execRuntime.value = data.runtime
    execStatus.value = data.exit_code || data.stderr ? "error" : "success"
  }

  watch(() => props.scriptId, fetchDetail, { immediate: true })
</script>

<template>
  <div class="h-full flex-col-stretch gap-8px overflow-hidden">
    <!-- Toolbar -->
    <NCard :bordered="false" size="small" class="card-wrapper flex-shrink-0">
      <div class="flex items-center gap-12px">
        <NButton quaternary size="small" @click="emit('back')">
          <template #icon>
            <icon-ic-round-arrow-back class="text-icon" />
          </template>
          {{ $t("page.script.backToList") }}
        </NButton>

        <template v-if="scriptData">
          <NDivider vertical />
          <span class="font-bold text-15px">{{ scriptData.name }}</span>
          <NTag size="small" :bordered="false" round>{{ scriptData.language }}</NTag>
        </template>

        <div class="ml-auto flex items-center gap-8px">
          <NButton v-if="hasAuth('script:edit')" size="small" :loading="saving" @click="handleSave">
            <template #icon>
              <icon-ic-round-save class="text-icon" />
            </template>
            {{ $t("page.script.save") }}
          </NButton>
          <NButton
            v-if="hasAuth('script:execute')"
            type="primary"
            size="small"
            :loading="execStatus === 'running'"
            @click="handleRun"
          >
            <template #icon>
              <icon-ic-round-play-arrow class="text-icon" />
            </template>
            {{ $t("page.script.execute") }}
          </NButton>
        </div>
      </div>
    </NCard>

    <!-- Editor -->
    <div class="flex-1 min-h-0">
      <MonacoEditor
        v-model="code"
        :language="scriptData?.language"
        :theme="editorTheme"
        height="100%"
        @save="handleSave"
        @run="handleRun"
      />
    </div>

    <!-- Output Panel -->
    <OutputPanel
      :output="execOutput"
      :error="execError"
      :status="execStatus"
      :runtime="execRuntime"
      :theme="editorTheme"
    />
  </div>
</template>
