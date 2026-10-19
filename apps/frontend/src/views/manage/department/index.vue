<script setup lang="tsx">
  import { ref, shallowRef } from "vue"
  import type { TreeOption } from "naive-ui"
  import { NButton, NPopconfirm, NSpace, NTag } from "naive-ui"
  import { useBoolean } from "@rapidkit/hooks"
  import { enableStatusRecord } from "@/constants/business"
  import { fetchDeleteDepartment, fetchGetDepartmentTree } from "@/service/api"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { residentActionModel } from "@/hooks/business/table-actions/layout"
  import type { ActionModel } from "@/hooks/business/table-actions/types"
  import DepartmentOperateDrawer from "./modules/department-operate-drawer.vue"

  defineOptions({ name: "ManageDepartment" })

  const { hasAuth, getActionContext } = useAuth()
  const { bool: drawerVisible, setTrue: openDrawer } = useBoolean()

  const treeData = shallowRef<TreeOption[]>([])
  const loading = ref(false)
  const operateType = ref<"add" | "addChild" | "edit">("add")
  const editingData = shallowRef<Api.SystemManage.DepartmentTree | null>(null)
  const parentData = shallowRef<Api.SystemManage.DepartmentTree | null>(null)

  function buildTreeOptions(departments: Api.SystemManage.DepartmentTree[]): TreeOption[] {
    return departments.map((dept) => ({
      key: dept.id,
      label: dept.name,
      children: dept.children?.length ? buildTreeOptions(dept.children) : undefined,
      rawData: dept,
    }))
  }

  async function loadTree() {
    loading.value = true
    const { data, error } = await fetchGetDepartmentTree()
    loading.value = false
    if (error) return
    treeData.value = buildTreeOptions(data)
  }

  function handleAdd() {
    operateType.value = "add"
    editingData.value = null
    parentData.value = null
    openDrawer()
  }

  function handleAddChild(dept: Api.SystemManage.DepartmentTree) {
    operateType.value = "addChild"
    editingData.value = null
    parentData.value = dept
    openDrawer()
  }

  function handleEdit(dept: Api.SystemManage.DepartmentTree) {
    operateType.value = "edit"
    editingData.value = dept
    parentData.value = null
    openDrawer()
  }

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteDepartment(id)
    if (error) return
    window.$message?.success($t("common.deleteSuccess"))
    await loadTree()
  }

  const actions = useTableActions<Api.SystemManage.DepartmentTree>(() => {
    const model = residentActionModel<Api.SystemManage.DepartmentTree>({ add: $t("common.add"), edit: $t("common.edit"), delete: $t("common.delete") })
    const codes = { add: "department:create", edit: "department:update", delete: "department:delete" } as const
    return { ...model, actions: model.actions.map((action) => ({ ...action,
      access: { kind: "all", codes: [codes[action.key as keyof typeof codes]] },
    })) } satisfies ActionModel<Api.SystemManage.DepartmentTree>
  }, () => getActionContext(), (row) => row.id)

  function findDepartment(id: string, nodes = treeData.value): Api.SystemManage.DepartmentTree | undefined {
    for (const node of nodes) {
      const row = node.rawData as Api.SystemManage.DepartmentTree
      if (row.id === id) return row
      const child = findDepartment(id, node.children ?? [])
      if (child) return child
    }
    return undefined
  }

  const renderSuffix = ({ option }: { option: TreeOption }) => {
    const dept = option.rawData as Api.SystemManage.DepartmentTree
    const statusLabel = dept.status ? $t(enableStatusRecord[dept.status]) : ""
    const tagType = dept.status === "1" ? "success" : "warning"

    return (
      <NSpace size={8} align="center" class="ml-8px">
        <NTag size="small" type={tagType}>{statusLabel}</NTag>
        <span class="text-12px text-base-text-3">{dept.code}</span>
        {actions.rowEntries(dept).length > 0 && (
          <span class="inline-flex items-center gap-8px">
        {actions.visible(dept, "add") && (
          <NButton size="tiny" quaternary type="primary" onClick={(e: Event) => { e.stopPropagation(); handleAddChild(dept) }}>
            {$t("common.add")}
          </NButton>
        )}
        {actions.visible(dept, "edit") && (
          <NButton size="tiny" quaternary type="primary" onClick={(e: Event) => { e.stopPropagation(); handleEdit(dept) }}>
            {$t("common.edit")}
          </NButton>
        )}
        {actions.visible(dept, "delete") && (
          <NPopconfirm onPositiveClick={() => actions.run(() => findDepartment(dept.id), "delete", (latest) => handleDelete(latest.id))}>
            {{
              default: () => $t("common.confirmDelete"),
              trigger: () => (
                <NButton size="tiny" quaternary type="error" onClick={(e: Event) => e.stopPropagation()}>
                  {$t("common.delete")}
                </NButton>
              ),
            }}
          </NPopconfirm>
        )}
          </span>
        )}
      </NSpace>
    )
  }

  // init
  loadTree()
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard
      :title="$t('page.manage.department.title')"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <template #header-extra>
        <NButton v-if="hasAuth('department:create')" size="small" ghost type="primary" @click="handleAdd">
          <template #icon>
            <icon-ic-round-plus class="text-icon" />
          </template>
          {{ $t("common.add") }}
        </NButton>
      </template>
      <NSpin :show="loading">
        <NTree
          :data="treeData"
          block-line
          expand-on-click
          default-expand-all
          :render-suffix="renderSuffix"
          class="py-8px"
        />
        <NEmpty v-if="!loading && treeData.length === 0" />
      </NSpin>
      <DepartmentOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        :parent-data="parentData"
        @submitted="loadTree"
      />
    </NCard>
  </div>
</template>

<style scoped></style>
