<script setup lang="ts">
  import { computed, ref, useId } from "vue"
  import { NButton, useThemeVars } from "naive-ui"
  import IconCopy from "~icons/carbon/copy"
  import IconDownload from "~icons/carbon/download"
  import { copyRequestId } from "@rapidkit/utils"
  import { $t } from "@/locales"
  import { getAuthSession } from "@/service/request/auth-session"
  import { diagnosticGeneration } from "@/utils/diagnostics"
  import { downloadDiagnosticPackage } from "@/utils/download-diagnostics"
  import type { DiagnosticReferenceItem } from "@/utils/diagnostic-message"

  const props = defineProps<{
    description: string
    references: readonly DiagnosticReferenceItem[]
    count: number
    owner: number
  }>()
  const theme = useThemeVars()
  const expanded = ref(false)
  const status = ref("")
  const detailsId = useId()
  const visibleReferences = computed(() => (expanded.value ? props.references : props.references.slice(0, 1)))
  function isCurrent() {
    getAuthSession()
    return props.owner === diagnosticGeneration()
  }
  async function copy(id: string) {
    if (!isCurrent()) return
    const success = await copyRequestId(id)
    if (isCurrent()) status.value = $t(success ? "request.copySucceeded" : "request.copyFailed")
  }
  function download() {
    if (!isCurrent()) return
    const success = downloadDiagnosticPackage()
    if (isCurrent()) status.value = success ? "" : $t("request.exportFailed")
  }
</script>

<template>
  <div
    class="diagnostic-notification"
    :style="{ '--diagnostic-muted': theme.textColor3, '--diagnostic-divider': theme.dividerColor }"
  >
    <p class="diagnostic-description">{{ description }}</p>
    <p v-if="count > 1" class="diagnostic-repeat" aria-live="polite">{{ $t("request.repeatedError", { count }) }}</p>
    <dl v-if="references.length" :id="detailsId" class="diagnostic-references">
      <div v-for="item in visibleReferences" :key="item.label" class="diagnostic-reference">
        <dt>{{ $t(item.label) }}</dt>
        <dd>
          <code :aria-label="$t(item.label)">{{ item.id }}</code>
        </dd>
        <NButton
          class="diagnostic-copy"
          size="small"
          :aria-label="$t('request.copyReference', { label: $t(item.label) })"
          @click="copy(item.id)"
        >
          <IconCopy aria-hidden="true" />
        </NButton>
      </div>
    </dl>
    <div class="diagnostic-actions">
      <NButton
        v-if="references.length > 1"
        text
        type="primary"
        :aria-expanded="expanded"
        :aria-controls="detailsId"
        @click="expanded = !expanded"
      >
        {{ $t(expanded ? "request.hideDetails" : "request.showDetails") }}
      </NButton>
      <NButton size="small" @click="download"
        ><template #icon><IconDownload aria-hidden="true" /></template>{{ $t("request.exportDiagnostics") }}</NButton
      >
    </div>
    <p v-if="status" class="diagnostic-status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
  .diagnostic-notification {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .diagnostic-description {
    margin: 0;
    white-space: pre-wrap;
  }
  .diagnostic-repeat,
  .diagnostic-status {
    margin: 8px 0 0;
    color: var(--diagnostic-muted);
    font-size: 12px;
  }
  .diagnostic-references {
    margin: 12px 0 0;
  }
  .diagnostic-reference {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 8px;
  }
  .diagnostic-reference + .diagnostic-reference {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--diagnostic-divider);
  }
  .diagnostic-reference dt {
    grid-column: 1 / -1;
    color: var(--diagnostic-muted);
    font-size: 12px;
  }
  .diagnostic-reference dd {
    min-width: 0;
    margin: 0;
  }
  .diagnostic-reference code {
    font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    user-select: all;
    overflow-wrap: anywhere;
  }
  .diagnostic-copy {
    min-width: 28px;
    min-height: 28px;
    padding: 4px;
  }
  .diagnostic-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 16px;
  }
  .diagnostic-actions > * {
    flex-shrink: 0;
  }
  @media (pointer: coarse) {
    .diagnostic-copy {
      min-width: 44px;
      min-height: 44px;
    }
    .diagnostic-actions :deep(.n-button) {
      min-height: 44px;
    }
  }
</style>
