<script setup lang="tsx">
  import { computed, reactive, ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { enableStatusRecord, scriptLanguageRecord } from "@/constants/business"
  import { fetchBatchDeleteScripts, fetchDeleteScript, fetchGetScriptList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import EditorPage from "./modules/editor-page.vue"
  import ScriptOperateDrawer from "./modules/script-operate-drawer.vue"
  import ScriptSearch from "./modules/script-search.vue"

  const appStore = useAppStore()
  const { hasAuth } = useAuth()

  const editingScriptId = ref<string | null>(null)
  const showEditor = computed(() => editingScriptId.value !== null)

  const searchParams: Api.Script.ScriptSearchParams = reactive({
    page: 1,
    pageSize: 10,
    keyword: undefined,
    status: undefined,
    language: undefined,
  })

  const { columns, columnChecks, data, loading, getData, getDataByPage, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetScriptList(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page!
      searchParams.pageSize = params.pageSize!
    },
    columns: () => [
      {
        type: "selection",
        align: "center",
        width: 48,
      },
      {
        key: "index",
        title: $t("common.index"),
        width: 64,
        align: "center",
        render: (_, index) => index + 1,
      },
      {
        key: "name",
        title: $t("page.script.scriptName"),
        minWidth: 120,
        render: (row) => (
          <NButton text type="primary" onClick={() => openEditor(row.id)}>
            {row.name}
          </NButton>
        ),
      },
      {
        key: "language",
        title: $t("page.script.language"),
        align: "center",
        width: 120,
        render: (row) => {
          const label = $t(scriptLanguageRecord[row.language as Api.Script.ScriptLanguage])
          return <NTag size="small">{label}</NTag>
        },
      },
      {
        key: "status",
        title: $t("page.script.scriptStatus"),
        align: "center",
        width: 100,
        render: (row) => {
          if (row.status === null) {
            return null
          }

          const tagMap: Record<Api.Common.EnableStatus, NaiveUI.ThemeColor> = {
            1: "success",
            2: "warning",
          }

          const label = $t(enableStatusRecord[row.status])

          return <NTag type={tagMap[row.status]}>{label}</NTag>
        },
      },
      {
        key: "operate",
        title: $t("common.operate"),
        align: "center",
        width: 220,
        render: (row) => (
          <div class="flex-center gap-8px">
            {hasAuth("script:edit") && (
              <NButton type="primary" ghost size="small" onClick={() => openEditor(row.id)}>
                {$t("page.script.editCode")}
              </NButton>
            )}
            {hasAuth("script:edit") && (
              <NButton type="info" ghost size="small" onClick={() => edit(row.id)}>
                {$t("common.edit")}
              </NButton>
            )}
            {hasAuth("script:delete") && (
              <NPopconfirm onPositiveClick={() => handleDelete(row.id)}>
                {{
                  default: () => $t("common.confirmDelete"),
                  trigger: () => (
                    <NButton type="error" ghost size="small">
                      {$t("common.delete")}
                    </NButton>
                  ),
                }}
              </NPopconfirm>
            )}
          </div>
        ),
      },
    ],
  })

  const { drawerVisible, operateType, editingData, handleAdd, handleEdit, checkedRowKeys, onBatchDeleted, onDeleted } =
    useTableOperate(data, "id", getData)

  function openEditor(id: string) {
    editingScriptId.value = id
  }

  function closeEditor() {
    editingScriptId.value = null
    getData()
  }

  async function handleBatchDelete() {
    const { error } = await fetchBatchDeleteScripts(checkedRowKeys.value as string[])
    if (!error) onBatchDeleted()
  }

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteScript(id)
    if (!error) onDeleted()
  }

  function edit(id: string) {
    handleEdit(id)
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <template v-if="!showEditor">
      <NAlert :title="$t('common.warning')" type="warning">
        {{ $t("page.script.securityWarning") }}
      </NAlert>
      <ScriptSearch v-model:model="searchParams" @search="getDataByPage" />
      <NCard :title="$t('page.script.title')" :bordered="false" size="small" class="card-wrapper sm:flex-1-hidden">
        <template #header-extra>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <NButton v-if="hasAuth('script:add')" size="small" ghost type="primary" @click="handleAdd">
              <template #icon>
                <icon-ic-round-plus class="text-icon" />
              </template>
              {{ $t("common.add") }}
            </NButton>
            <NPopconfirm v-if="hasAuth('script:delete')" @positive-click="handleBatchDelete">
              <template #trigger>
                <NButton size="small" ghost type="error" :disabled="checkedRowKeys.length === 0">
                  <template #icon>
                    <icon-ic-round-delete class="text-icon" />
                  </template>
                  {{ $t("common.batchDelete") }}
                </NButton>
              </template>
              {{ $t("common.confirmDelete") }}
            </NPopconfirm>
          </TableHeaderOperation>
        </template>
        <NDataTable
          v-model:checked-row-keys="checkedRowKeys"
          :columns="columns"
          :data="data"
          size="small"
          :flex-height="!appStore.isMobile"
          :scroll-x="702"
          :loading="loading"
          remote
          :row-key="(row) => row.id"
          :pagination="mobilePagination"
          class="sm:h-full"
        />
        <ScriptOperateDrawer
          v-model:visible="drawerVisible"
          :operate-type="operateType"
          :row-data="editingData"
          @submitted="getDataByPage"
        />
      </NCard>
    </template>
    <EditorPage v-else :script-id="editingScriptId!" @back="closeEditor" />
  </div>
</template>

<style scoped></style>
