<script setup lang="ts">
  import { computed, h, ref, shallowRef } from "vue"
  import type { TreeOption } from "naive-ui"
  import { NButton, NDropdown } from "naive-ui"
  import { fetchDeleteDepartment, fetchGetDepartmentTree, fetchGetUserDepartmentCounts } from "@/service/api"
  import { useAuth } from "@/hooks/business/auth"
  import { $t } from "@/locales"
  import SvgIcon from "@/components/custom/svg-icon.vue"
  import DepartmentOperateDrawer from "../../department/modules/department-operate-drawer.vue"
  import { createDepartmentMap } from "../composables/department-map"

  defineOptions({ name: "UserDepartmentPanel" })
  const selectedId = defineModel<string>("selectedId", { required: true })
  const emit = defineEmits<{ loaded: [tree: Api.SystemManage.DepartmentTree[]]; changed: [] }>()
  const { hasAuth } = useAuth()
  const tree = shallowRef<Api.SystemManage.DepartmentTree[]>([])
  const counts = shallowRef<Api.SystemManage.UserDepartmentCounts | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  const keyword = ref("")
  let requestId = 0
  const drawerVisible = ref(false)
  const operateType = ref<"add" | "addChild" | "edit">("add")
  const editingData = shallowRef<Api.SystemManage.DepartmentTree | null>(null)
  const parentData = shallowRef<Api.SystemManage.DepartmentTree | null>(null)

  function findDepartment(id: string, nodes = tree.value): Api.SystemManage.DepartmentTree | undefined {
    for (const department of nodes) {
      if (department.id === id) return department
      const child = findDepartment(id, department.children ?? [])
      if (child) return child
    }
    return undefined
  }

  const options = computed(() => {
    const visibleDepartments = createDepartmentMap(tree.value)
    // Hidden departments make their ancestor totals unknowable from the visible tree.
    const completeCounts = counts.value && Object.keys(counts.value.departments).every((id) => id in visibleDepartments)
    function build(nodes: Api.SystemManage.DepartmentTree[]): TreeOption[] {
      return nodes.map((department) => {
        const children = build(department.children ?? [])
        const count =
          counts.value && completeCounts
            ? (counts.value.departments[department.id] ?? 0) +
              children.reduce((sum, child) => sum + Number(child.count), 0)
            : null
        return { key: department.id, label: department.name, count, children: children.length ? children : undefined }
      })
    }
    return build(tree.value)
  })

  async function reload() {
    const current = ++requestId
    loading.value = true
    const [departments, members] = await Promise.all([fetchGetDepartmentTree(), fetchGetUserDepartmentCounts()])
    if (current !== requestId) return
    loading.value = false
    failed.value = Boolean(departments.error)
    counts.value = members.error ? null : members.data
    if (departments.error) return
    tree.value = departments.data
    if (!["all", "unassigned"].includes(selectedId.value) && !findDepartment(selectedId.value)) selectedId.value = "all"
    emit("loaded", tree.value)
  }

  const menuOptions = computed(() => {
    if (failed.value) return []
    return [
      ...(hasAuth("department:create") ? [{ key: "addChild", label: $t("page.manage.user.directory.addChild") }] : []),
      ...(hasAuth("department:update") ? [{ key: "edit", label: $t("page.manage.department.editDepartment") }] : []),
      ...(hasAuth("department:delete") ? [{ key: "delete", label: $t("common.delete") }] : []),
    ]
  })

  function addDepartment() {
    if (!hasAuth("department:create")) return
    operateType.value = "add"
    editingData.value = null
    parentData.value = null
    drawerVisible.value = true
  }

  function selectAction(key: string, departmentId: string) {
    const department = findDepartment(departmentId)
    if (!department || failed.value || !menuOptions.value.some((option) => option.key === key)) return
    if (key === "delete") {
      window.$dialog?.warning({
        title: $t("common.confirm"),
        content: $t("common.confirmDelete"),
        positiveText: $t("common.confirm"),
        negativeText: $t("common.cancel"),
        onPositiveClick: async () => {
          if (!hasAuth("department:delete") || !findDepartment(department.id) || failed.value) return
          const { error } = await fetchDeleteDepartment(department.id)
          if (error) return false
          window.$message?.success($t("common.deleteSuccess"))
          await submitted()
          return true
        },
      })
      return
    }
    operateType.value = key === "edit" ? "edit" : "addChild"
    editingData.value = key === "edit" ? department : null
    parentData.value = key === "addChild" ? department : null
    drawerVisible.value = true
  }

  async function submitted() {
    await reload()
    emit("changed")
  }

  function renderDepartmentSuffix({ option }: { option: TreeOption }) {
    const count = h(
      "span",
      { class: "ml-8px text-12px text-base-text-3 tabular-nums", "data-department-count": option.key },
      option.count === null ? "—" : String(option.count),
    )
    return h("div", { class: "flex items-center gap-6px" }, [
      count,
      menuOptions.value.length
        ? h(
            "span",
            {
              onClick: (event: MouseEvent) => event.stopPropagation(),
              onKeydown: (event: KeyboardEvent) => event.stopPropagation(),
            },
            h(
              NDropdown,
              {
                options: menuOptions.value,
                trigger: "click",
                placement: "bottom-end",
                onSelect: (key: string) => selectAction(key, String(option.key)),
              },
              {
                default: () =>
                  h(
                    NButton,
                    {
                      quaternary: true,
                      circle: true,
                      size: "tiny",
                      "aria-label": `${option.label} · ${$t("page.manage.user.directory.departmentActions")}`,
                    },
                    { icon: () => h(SvgIcon, { icon: "ic:round-more-horiz", class: "text-16px" }) },
                  ),
              },
            ),
          )
        : null,
    ])
  }

  defineExpose({ reload })
  reload()
</script>

<template>
  <aside class="department-panel flex-col-stretch gap-16px p-20px" :aria-label="$t('page.manage.department.title')">
    <div class="flex items-center justify-between gap-8px">
      <h2 class="m-0 text-16px font-semibold">{{ $t("page.manage.department.column") }}</h2>
      <NTooltip v-if="hasAuth('department:create')">
        <template #trigger>
          <NButton
            quaternary
            circle
            type="primary"
            size="small"
            :aria-label="$t('page.manage.user.directory.addRoot')"
            @click="addDepartment"
          >
            <template #icon><icon-ic-round-plus /></template>
          </NButton>
        </template>
        {{ $t("page.manage.user.directory.addRoot") }}
      </NTooltip>
    </div>
    <NInput
      v-model:value="keyword"
      clearable
      :placeholder="$t('page.manage.user.directory.searchDepartments')"
      :aria-label="$t('page.manage.user.directory.searchDepartments')"
    >
      <template #prefix><icon-ic-round-search class="text-base-text-3" /></template>
    </NInput>
    <div class="flex-col-stretch gap-4px">
      <button
        v-for="item in [
          { id: 'all', label: $t('page.manage.user.directory.allUsers'), count: counts?.total },
          { id: 'unassigned', label: $t('page.manage.user.directory.unassigned'), count: counts?.unassigned },
        ]"
        :key="item.id"
        type="button"
        class="directory-shortcut flex items-center justify-between gap-8px"
        :class="{ active: selectedId === item.id }"
        :aria-pressed="selectedId === item.id"
        @click="selectedId = item.id"
      >
        <span class="flex items-center gap-8px"
          ><icon-ic-outline-people v-if="item.id === 'all'" class="text-18px" /><icon-ic-outline-person-off
            v-else
            class="text-18px"
          />{{ item.label }}</span
        >
        <span class="text-12px tabular-nums">{{ item.count ?? "—" }}</span>
      </button>
    </div>
    <NSpin :show="loading" class="min-h-100px">
      <div v-if="failed" class="flex-col-stretch gap-12px text-13px text-base-text-3" role="alert">
        {{ $t("page.manage.user.directory.loadFailed") }}
        <NButton size="small" @click="reload">{{ $t("common.refresh") }}</NButton>
      </div>
      <NTree
        v-else-if="tree.length"
        class="department-tree"
        :data="options"
        :theme-overrides="{ nodeHeight: '48px', nodeWrapperPadding: '2px 0', nodeBorderRadius: '6px' }"
        :pattern="keyword"
        :show-irrelevant-nodes="false"
        :selected-keys="[selectedId]"
        :render-suffix="renderDepartmentSuffix"
        block-line
        default-expand-all
        :expand-on-click="false"
        @update:selected-keys="
          (keys) => {
            if (keys.length) selectedId = String(keys[0])
          }
        "
      />
      <NEmpty v-else-if="!loading" size="small" />
    </NSpin>
    <DepartmentOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      :parent-data="parentData"
      @submitted="submitted"
    />
  </aside>
</template>

<style scoped>
  .directory-shortcut {
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 11px 12px;
    min-height: 44px;
    color: rgb(var(--base-text-2-color));
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.2s,
      color 0.2s;
  }
  .directory-shortcut:hover {
    background: rgb(var(--primary-color) / 0.06);
    color: rgb(var(--primary-color));
  }
  .directory-shortcut.active {
    color: rgb(var(--primary-color));
    background: rgb(var(--primary-color) / 0.1);
  }
  .directory-shortcut.active:hover {
    background: rgb(var(--primary-color) / 0.16);
  }
  .department-tree :deep(.n-tree-node-content) {
    padding-right: 12px;
  }
  .directory-shortcut:focus-visible {
    outline: 2px solid rgb(var(--primary-color));
    outline-offset: 2px;
  }
</style>
