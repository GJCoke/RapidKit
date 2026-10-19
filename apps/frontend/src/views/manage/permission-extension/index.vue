<script setup lang="tsx">
  import { computed, onMounted, ref } from "vue"
  import type { DataTableColumns } from "naive-ui"
  import { NButton, NPopconfirm, NTag, NText } from "naive-ui"
  import { residentActionModel } from "@/hooks/business/table-actions/layout"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { tableScrollWidth } from "@/hooks/common/table-columns"
  import { useAuth } from "@/hooks/business/auth"
  import { $t } from "@/locales"
  import { useAppStore } from "@/store/modules/app"
  import {
    fetchDeletePermissionExtension,
    fetchGetPermissionDenials,
    fetchGetPermissionExtensions,
  } from "@/service/api"
  import { extensionStatusTagType } from "./modules/extension-form"
  import ExtensionExportModal from "./modules/extension-export-modal.vue"
  import ExtensionOperateDrawer from "./modules/extension-operate-drawer.vue"

  const { getActionContext } = useAuth()

  defineOptions({ name: "ManagePermissionExtension" })

  const appStore = useAppStore()

  const activeTab = ref<"extensions" | "denials">("extensions")
  const extensions = ref<Api.PermissionExtension.Extension[]>([])
  const denials = ref<Api.PermissionExtension.Denial[]>([])
  const days = ref(7)
  const loading = ref(false)

  const drawerVisible = ref(false)
  const exportVisible = ref(false)
  const operateType = ref<"add" | "edit">("add")
  const editingData = ref<Api.PermissionExtension.Extension | null>(null)
  const preset = ref<{ code: string; routeKey: string } | null>(null)

  async function loadExtensions() {
    loading.value = true
    const { data } = await fetchGetPermissionExtensions()
    loading.value = false
    extensions.value = data ?? []
  }

  async function loadDenials() {
    loading.value = true
    const { data } = await fetchGetPermissionDenials(days.value)
    loading.value = false
    denials.value = data ?? []
  }

  function handleAdd() {
    operateType.value = "add"
    editingData.value = null
    preset.value = null
    drawerVisible.value = true
  }

  function handleEdit(row: Api.PermissionExtension.Extension) {
    operateType.value = "edit"
    editingData.value = row
    preset.value = null
    drawerVisible.value = true
  }

  function handleBindFromDenial(row: Api.PermissionExtension.Denial) {
    operateType.value = "add"
    editingData.value = null
    preset.value = { code: row.code, routeKey: row.routeKey }
    drawerVisible.value = true
  }

  async function handleDelete(id: string) {
    const { error } = await fetchDeletePermissionExtension(id)
    if (error) return
    window.$message?.success($t("common.deleteSuccess"))
    await loadExtensions()
  }

  function targetOf(row: Api.PermissionExtension.Extension) {
    if (row.kind === "route_binding") return row.routeKey
    if (row.kind === "depends") return row.dependsOn
    return `${row.label ?? ""}（${row.resource ?? ""} · ${$t(`page.manage.permissionExtension.actionOptions.${row.abacAction === "write" ? "write" : "read"}`)}）`
  }

  const extensionActions = useTableActions(() => residentActionModel<Api.PermissionExtension.Extension>({ edit: $t("common.edit"), delete: $t("common.delete") }), () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)
  const denialActions = useTableActions(() => residentActionModel<Api.PermissionExtension.Denial>({ bind: $t("page.manage.permissionExtension.denials.bind") }), () => getActionContext(appStore.locale, appStore.isMobile), (row) => `${row.routeKey}:${row.code}`)
  const extensionColumns = computed<DataTableColumns<Api.PermissionExtension.Extension>>(() => [
    {
      key: "kind",
      title: $t("page.manage.permissionExtension.kind"),
      width: 120,
      render: (row) => <NTag size="small">{$t(`page.manage.permissionExtension.kindOptions.${row.kind}`)}</NTag>,
    },
    { key: "code", title: $t("page.manage.permissionExtension.code"), minWidth: 160 },
    {
      key: "target",
      title: $t("page.manage.permissionExtension.target"),
      minWidth: 240,
      render: (row) => targetOf(row),
    },
    {
      key: "status",
      title: $t("page.manage.permissionExtension.status"),
      width: 220,
      render: (row) => (
        <div class="flex flex-col gap-2px">
          <NTag size="small" type={extensionStatusTagType(row.status)}>
            {$t(`page.manage.permissionExtension.statusOptions.${row.status}`)}
          </NTag>
          {row.reason && (
            <NText depth="3" class="text-12px">
              {$t(`page.manage.permissionExtension.reasonOptions.${row.reason}` as any)}
            </NText>
          )}
        </div>
      ),
    },
    { key: "note", title: $t("page.manage.permissionExtension.note"), minWidth: 160, ellipsis: { tooltip: true } },
    { key: "createTime", title: $t("page.manage.permissionExtension.createTime"), width: 180 },
    ...extensionActions.column({
      key: "operate",
      title: $t("common.operate"),
      render: (row) => (
        <div class="flex items-center justify-start gap-8px">
          <NButton type="primary" ghost size="small" onClick={() => handleEdit(row)}>
            {$t("common.edit")}
          </NButton>
          <NPopconfirm onPositiveClick={() => extensionActions.run(() => extensions.value.find((item) => item.id === row.id), "delete", (latest) => handleDelete(latest.id))}>
            {{
              default: () => $t("common.confirmDelete"),
              trigger: () => (
                <NButton type="error" ghost size="small">
                  {$t("common.delete")}
                </NButton>
              ),
            }}
          </NPopconfirm>
        </div>
      ),
    }),
  ])

  const denialColumns = computed<DataTableColumns<Api.PermissionExtension.Denial>>(() => [
    {
      key: "code",
      title: $t("page.manage.permissionExtension.code"),
      minWidth: 200,
      render: (row) => (row.codeLabel ? `${row.codeLabel}（${row.code}）` : row.code),
    },
    { key: "routeKey", title: $t("page.manage.permissionExtension.routeKey"), minWidth: 260 },
    { key: "count", title: $t("page.manage.permissionExtension.denials.count"), width: 90, align: "center" },
    { key: "lastAt", title: $t("page.manage.permissionExtension.denials.lastAt"), width: 180 },
    { key: "lastUserId", title: $t("page.manage.permissionExtension.denials.lastUser"), width: 300 },
    ...denialActions.column({
      key: "operate",
      title: $t("common.operate"),
      render: (row) => (
        <NButton type="primary" ghost size="small" onClick={() => handleBindFromDenial(row)}>
          {$t("page.manage.permissionExtension.denials.bind")}
        </NButton>
      ),
    }),
  ])

  const extensionScrollX = computed(() => tableScrollWidth(extensionColumns.value))
  const denialScrollX = computed(() => tableScrollWidth(denialColumns.value))

  function handleTabChange(tab: "extensions" | "denials") {
    if (tab === "denials") loadDenials()
    else loadExtensions()
  }

  onMounted(loadExtensions)
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard
      :title="$t('page.manage.permissionExtension.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <div class="flex items-center gap-8px">
          <template v-if="activeTab === 'extensions'">
            <NButton size="small" @click="exportVisible = true">
              {{ $t("page.manage.permissionExtension.export") }}
            </NButton>
            <NButton size="small" ghost type="primary" @click="handleAdd">
              <template #icon>
                <icon-ic-round-plus class="text-icon" />
              </template>
              {{ $t("page.manage.permissionExtension.add") }}
            </NButton>
          </template>
          <template v-else>
            <NText depth="3">{{ $t("page.manage.permissionExtension.denials.days") }}</NText>
            <NInputNumber
              v-model:value="days"
              :min="1"
              :max="7"
              size="small"
              class="w-90px"
              @update:value="loadDenials"
            />
          </template>
        </div>
      </template>
      <NTabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
        <NTabPane name="extensions" :tab="$t('page.manage.permissionExtension.tabExtensions')">
          <NDataTable
            :columns="extensionColumns"
            :data="extensions"
            size="small"
            :flex-height="!appStore.isMobile"
            :scroll-x="extensionScrollX"
            :loading="loading"
            :row-key="(row) => row.id"
            class="sm:h-[calc(100%-48px)]"
          />
        </NTabPane>
        <NTabPane name="denials" :tab="$t('page.manage.permissionExtension.tabDenials')">
          <NDataTable
            :columns="denialColumns"
            :data="denials"
            size="small"
            :scroll-x="denialScrollX"
            :loading="loading"
            :row-key="(row) => `${row.code}|${row.routeKey}`"
          >
            <template #empty>
              <NEmpty :description="$t('page.manage.permissionExtension.denials.empty')" />
            </template>
          </NDataTable>
        </NTabPane>
      </NTabs>
    </NCard>

    <ExtensionOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      :preset="preset"
      @submitted="loadExtensions"
    />
    <ExtensionExportModal v-model:visible="exportVisible" />
  </div>
</template>
