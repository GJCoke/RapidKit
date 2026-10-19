<script setup lang="ts">
  import { $t } from "@/locales"

  defineOptions({
    name: "TableHeaderOperation",
  })

  interface Props {
    itemAlign?: NaiveUI.Align
    loading?: boolean
    showColumnSetting?: boolean
    showBusinessActions?: boolean
  }

  withDefaults(defineProps<Props>(), { showColumnSetting: true, showBusinessActions: true })

  interface Emits {
    (e: "refresh"): void
  }

  const emit = defineEmits<Emits>()

  const columns = defineModel<NaiveUI.TableColumnCheck[]>("columns", {
    default: () => [],
  })

  function refresh() {
    emit("refresh")
  }
</script>

<template>
  <NSpace :align="itemAlign" wrap justify="end" class="lt-sm:w-200px">
    <slot name="prefix"></slot>
    <template v-if="showBusinessActions"><slot></slot></template>
    <NButton size="small" @click="refresh">
      <template #icon>
        <icon-mdi-refresh class="text-icon" :class="{ 'animate-spin': loading }" />
      </template>
      {{ $t("common.refresh") }}
    </NButton>
    <TableColumnSetting v-if="showColumnSetting" v-model:columns="columns" />
    <slot name="suffix"></slot>
  </NSpace>
</template>

<style scoped></style>
