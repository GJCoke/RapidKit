<script setup lang="ts">
  import { computed, h, nextTick, ref, shallowRef, watch } from "vue"
  import type { TreeOption } from "naive-ui"
  import { NButton, NDropdown, NEllipsis, NHighlight } from "naive-ui"
  import { fetchDeleteDepartment, fetchGetDepartmentTree, fetchGetUserDepartmentCounts } from "@/service/api"
  import { useAuth } from "@/hooks/business/auth"
  import { $t } from "@/locales"
  import SvgIcon from "@/components/custom/svg-icon.vue"
  import DepartmentOperateDrawer from "../../department/modules/department-operate-drawer.vue"
  import { createDepartmentNavigationIndex } from "../composables/department-navigation"

  defineOptions({ name: "UserDepartmentPanel" })
  const selectedId = defineModel<string>("selectedId", { required: true })
  const emit = defineEmits<{ loaded: [tree: Api.SystemManage.DepartmentTree[]]; changed: [] }>()
  const { hasAuth } = useAuth()
  const tree = shallowRef<Api.SystemManage.DepartmentTree[]>([])
  const counts = shallowRef<Api.SystemManage.UserDepartmentCounts | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  const keyword = ref("")
  const searchPattern = computed(() => keyword.value.trim())
  const openMenuId = ref<string | null>(null)
  const scopeId = ref<string | null>(null)
  const expandedKeys = ref<string[]>([])
  const ancestorMenuOpen = ref(false)
  const directoryElement = ref<HTMLElement>()
  const departmentIndex = computed(() => createDepartmentNavigationIndex(tree.value))
  const scopePath = computed(() => (scopeId.value ? (departmentIndex.value.get(scopeId.value)?.path ?? []) : []))
  const breadcrumbs = computed(() =>
    scopePath.value.length > 3 ? [scopePath.value[0], null, scopePath.value.at(-1)!] : scopePath.value,
  )
  const ancestorOptions = computed(() =>
    scopePath.value.slice(1, -1).map((department) => ({
      key: department.id,
      label: () => h("span", { "data-department-ancestor": department.id }, department.name),
      icon: () => h(SvgIcon, { icon: "ic:outline-folder" }),
    })),
  )
  let requestId = 0
  const drawerVisible = ref(false)
  const operateType = ref<"add" | "addChild" | "edit">("add")
  const editingData = shallowRef<Api.SystemManage.DepartmentTree | null>(null)
  const parentData = shallowRef<Api.SystemManage.DepartmentTree | null>(null)

  const directoryOptions = computed(() => {
    const byId = new Map<string, TreeOption>()
    // Hidden departments make their ancestor totals unknowable from the visible tree.
    const completeCounts =
      counts.value && Object.keys(counts.value.departments).every((id) => departmentIndex.value.has(id))
    function build(nodes: Api.SystemManage.DepartmentTree[]): TreeOption[] {
      return nodes.map((department) => {
        const children = build(department.children ?? [])
        const count =
          counts.value && completeCounts
            ? (counts.value.departments[department.id] ?? 0) +
              children.reduce((sum, child) => sum + Number(child.count), 0)
            : null
        const option: TreeOption = {
          key: department.id,
          label: department.name,
          count,
          prefix: () =>
            h(SvgIcon, {
              icon: department.parentId ? "ic:outline-folder" : "ic:outline-business",
              class: "department-icon text-16px text-base-text-3",
            }),
          children: children.length ? children : undefined,
        }
        byId.set(department.id, option)
        return option
      })
    }
    return { roots: build(tree.value), byId }
  })

  const visibleOptions = computed(() => {
    const scoped = scopeId.value && directoryOptions.value.byId.get(scopeId.value)
    return scoped ? [scoped] : directoryOptions.value.roots
  })
  const searchResults = computed(() =>
    [...departmentIndex.value.values()].filter(({ department }) =>
      department.name.toLowerCase().includes(searchPattern.value.toLowerCase()),
    ),
  )
  const visibleExpandedKeys = computed(() => expandedKeys.value.filter((id) => !isDepthBoundary(id)))
  const visibleSelectedKeys = computed(() => {
    const path = departmentIndex.value.get(selectedId.value)?.path
    if (!path) return []
    const start = scopeId.value ? path.findIndex((node) => node.id === scopeId.value) : 0
    if (start < 0) return []
    const visiblePath = path.slice(start)
    if (visiblePath.length > (scopeId.value ? 3 : 4)) return []
    return visiblePath.slice(0, -1).every((node) => visibleExpandedKeys.value.includes(node.id))
      ? [selectedId.value]
      : []
  })

  function isDepthBoundary(id: string) {
    const depth = (departmentIndex.value.get(id)?.path.length ?? 0) - 1
    return depth - Math.max(0, scopePath.value.length - 1) >= (scopeId.value ? 2 : 3)
  }

  function seedExpansion() {
    const keys = new Set(expandedKeys.value.filter((id) => departmentIndex.value.has(id)))
    for (const [id, { department, path }] of departmentIndex.value) {
      const inScope = !scopeId.value || path.some((ancestor) => ancestor.id === scopeId.value)
      const relativeDepth = path.length - 1 - Math.max(0, scopePath.value.length - 1)
      if (inScope && relativeDepth < 2 && department.children?.length) keys.add(id)
    }
    for (const ancestor of departmentIndex.value.get(selectedId.value)?.path.slice(0, -1) ?? []) keys.add(ancestor.id)
    expandedKeys.value = [...keys]
  }

  function navigateScope(id: string | number | null) {
    if (id !== null && !departmentIndex.value.has(String(id))) return
    scopeId.value = id === null ? null : String(id)
    keyword.value = ""
    openMenuId.value = null
    ancestorMenuOpen.value = false
    seedExpansion()
  }

  function focusDirectory() {
    nextTick(() => directoryElement.value?.querySelector<HTMLElement>(".n-tree")?.focus())
  }

  function locateDepartment(id: string) {
    const path = departmentIndex.value.get(id)?.path
    if (!path) return
    navigateScope(path.length > 3 ? path.at(-3)!.id : null)
    expandedKeys.value = [...new Set([...expandedKeys.value, ...path.slice(0, -1).map((node) => node.id)])]
    selectedId.value = id
    focusDirectory()
  }

  function updateExpandedKeys(
    keys: Array<string | number>,
    _options: Array<TreeOption | null>,
    meta: { node: TreeOption | null; action: string },
  ) {
    if (meta.action === "expand" && meta.node && isDepthBoundary(String(meta.node.key))) {
      navigateScope(String(meta.node.key))
      focusDirectory()
    } else expandedKeys.value = keys.map(String)
  }

  function renderSwitcherIcon({ option }: { option: TreeOption }) {
    if (!option.children?.length || !isDepthBoundary(String(option.key)))
      return h("span", { class: "inline-flex" }, h(SvgIcon, { icon: "ic:round-keyboard-arrow-right" }))
    return h(
      NButton,
      {
        text: true,
        size: "tiny",
        class: "department-enter text-primary",
        "data-department-enter": option.key,
        "aria-label": $t("page.manage.user.directory.enterDepartment", { name: String(option.label) }),
        title: $t("page.manage.user.directory.enterDepartment", { name: String(option.label) }),
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          navigateScope(String(option.key))
          focusDirectory()
        },
        onKeydown: (event: KeyboardEvent) => event.stopPropagation(),
      },
      { icon: () => h(SvgIcon, { icon: "ic:round-login", class: "text-14px" }) },
    )
  }

  watch(searchPattern, () => {
    openMenuId.value = null
    ancestorMenuOpen.value = false
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
    const oldPath = scopePath.value
    const initial = tree.value.length === 0
    tree.value = departments.data
    if (!["all", "unassigned"].includes(selectedId.value) && !departmentIndex.value.has(selectedId.value))
      selectedId.value = "all"
    if (scopeId.value && !departmentIndex.value.has(scopeId.value)) {
      navigateScope([...oldPath].reverse().find((node) => departmentIndex.value.has(node.id))?.id ?? null)
    } else if (initial) {
      if (departmentIndex.value.has(selectedId.value)) locateDepartment(selectedId.value)
      else seedExpansion()
    } else expandedKeys.value = expandedKeys.value.filter((id) => departmentIndex.value.has(id))
    emit("loaded", tree.value)
  }

  const menuOptions = computed(() => {
    if (failed.value) return []
    return [
      ...(hasAuth("department:create")
        ? [
            {
              key: "addChild",
              label: $t("page.manage.user.directory.addChild"),
              icon: () => h(SvgIcon, { icon: "ic:outline-create-new-folder" }),
            },
          ]
        : []),
      ...(hasAuth("department:update")
        ? [
            {
              key: "edit",
              label: $t("page.manage.department.editDepartment"),
              icon: () => h(SvgIcon, { icon: "ic:outline-edit" }),
            },
          ]
        : []),
      ...(hasAuth("department:delete")
        ? [
            ...(hasAuth("department:create") || hasAuth("department:update")
              ? [{ type: "divider", key: "delete-divider" }]
              : []),
            {
              key: "delete",
              label: () => h("span", { class: "text-error" }, $t("common.delete")),
              icon: () => h(SvgIcon, { icon: "ic:outline-delete", class: "text-error" }),
            },
          ]
        : []),
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
    const department = departmentIndex.value.get(departmentId)?.department
    if (!department || failed.value || !menuOptions.value.some((option) => option.key === key)) return
    if (key === "delete") {
      window.$dialog?.warning({
        title: $t("common.confirm"),
        content: $t("common.confirmDelete"),
        positiveText: $t("common.confirm"),
        negativeText: $t("common.cancel"),
        onPositiveClick: async () => {
          if (!hasAuth("department:delete") || !departmentIndex.value.has(department.id) || failed.value) return
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

  function renderDepartmentLabel({ option }: { option: TreeOption }) {
    return h(
      NEllipsis,
      { tooltip: { placement: "right", delay: 400 } },
      {
        default: () => String(option.label),
        tooltip: () => String(option.label),
      },
    )
  }

  function renderDepartmentSuffix({ option }: { option: TreeOption }) {
    const count = h(
      "span",
      { class: "directory-count", "data-department-count": option.key },
      option.count === null ? "—" : String(option.count),
    )
    return h("div", { class: "ml-6px flex shrink-0 items-center gap-4px" }, [
      count,
      menuOptions.value.length
        ? h(
            "span",
            {
              class: ["department-actions", { open: openMenuId.value === String(option.key) }],
              onClick: (event: MouseEvent) => event.stopPropagation(),
              onKeydown: (event: KeyboardEvent) => event.stopPropagation(),
            },
            h(
              NDropdown,
              {
                options: menuOptions.value,
                show: openMenuId.value === String(option.key),
                trigger: "click",
                placement: "bottom-end",
                onUpdateShow: (show: boolean) => {
                  openMenuId.value = show ? String(option.key) : null
                },
                onSelect: (key: string) => selectAction(key, String(option.key)),
              },
              {
                default: () =>
                  h(
                    NButton,
                    {
                      quaternary: true,
                      size: "tiny",
                      class: "department-menu-button",
                      "aria-expanded": openMenuId.value === String(option.key),
                      "aria-label": `${option.label} · ${$t("page.manage.user.directory.departmentActions")}`,
                    },
                    { icon: () => h(SvgIcon, { icon: "ic:round-more-horiz", class: "text-16px" }) },
                  ),
              },
            ),
          )
        : h("span", { class: "w-24px shrink-0", "aria-hidden": true }),
    ])
  }

  defineExpose({ reload })
  reload()
</script>

<template>
  <aside class="department-panel flex-col-stretch gap-16px p-16px" :aria-label="$t('page.manage.department.title')">
    <div class="directory-heading flex h-32px items-center justify-between gap-8px pl-4px">
      <h2 class="m-0 text-16px font-semibold">{{ $t("page.manage.department.column") }}</h2>
      <NTooltip v-if="hasAuth('department:create')">
        <template #trigger>
          <NButton
            quaternary
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
      class="department-search"
      :theme-overrides="{ heightMedium: '34px', fontSizeMedium: '13px' }"
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
        class="directory-shortcut flex h-40px items-center justify-between gap-8px rd-6px px-8px text-14px"
        :class="{ active: selectedId === item.id }"
        :aria-pressed="selectedId === item.id"
        @click="selectedId = item.id"
      >
        <span class="flex items-center gap-8px"
          ><icon-ic-outline-people
            v-if="item.id === 'all'"
            class="text-16px text-base-text-3"
          /><icon-ic-outline-person-off v-else class="text-16px text-base-text-3" />{{ item.label }}</span
        >
        <span class="directory-count mr-28px">{{ item.count ?? "—" }}</span>
      </button>
    </div>
    <div ref="directoryElement" class="department-section flex-col-stretch gap-8px pt-14px">
      <div class="flex items-center justify-between gap-8px px-4px">
        <h3 class="m-0 text-12px font-normal text-base-text-3">{{ $t("page.manage.user.directory.organization") }}</h3>
        <span class="text-11px text-base-text-3" aria-live="polite">{{
          $t("page.manage.user.directory.depth", { level: Math.max(1, scopePath.length) })
        }}</span>
      </div>
      <nav
        class="department-browse flex-col-stretch gap-8px px-4px pb-12px"
        :aria-label="$t('page.manage.user.directory.browseLocation')"
      >
        <div class="flex items-center justify-between gap-8px">
          <NButton
            text
            size="tiny"
            :disabled="!scopeId"
            data-department-back
            @click="navigateScope(scopePath.at(-2)?.id ?? null)"
          >
            <template #icon><SvgIcon icon="ic:round-arrow-back" /></template>{{ $t("page.manage.user.directory.back") }}
          </NButton>
          <NTooltip
            ><template #trigger
              ><NButton
                quaternary
                size="tiny"
                data-department-home
                :aria-label="$t('page.manage.user.directory.allDepartments')"
                @click="navigateScope(null)"
                ><template #icon><SvgIcon icon="ic:outline-home" /></template></NButton></template
            >{{ $t("page.manage.user.directory.allDepartments") }}</NTooltip
          >
        </div>
        <div class="flex min-w-0 items-center gap-2px text-12px">
          <span v-if="!scopePath.length" class="text-base-text-3">{{
            $t("page.manage.user.directory.allDepartments")
          }}</span>
          <template v-for="(department, index) in breadcrumbs" :key="department?.id ?? 'ancestors'">
            <SvgIcon v-if="index" icon="ic:round-chevron-right" class="shrink-0 text-12px text-base-text-3" />
            <NButton
              v-if="department"
              text
              size="tiny"
              class="department-crumb min-w-0 max-w-120px"
              :aria-current="department.id === scopeId ? 'location' : undefined"
              @click="navigateScope(department.id)"
            >
              <NEllipsis :tooltip="{ placement: 'bottom' }"
                >{{ department.name
                }}<template #tooltip>{{ scopePath.map((node) => node.name).join(" / ") }}</template></NEllipsis
              >
            </NButton>
            <NDropdown
              v-else
              v-model:show="ancestorMenuOpen"
              :options="ancestorOptions"
              trigger="click"
              placement="bottom-start"
              @select="navigateScope"
            >
              <NButton
                text
                size="tiny"
                data-department-ancestors
                :aria-expanded="ancestorMenuOpen"
                :aria-label="$t('page.manage.user.directory.completePath')"
                ><template #icon><SvgIcon icon="ic:round-more-horiz" /></template
              ></NButton>
            </NDropdown>
          </template>
        </div>
      </nav>
      <NSpin :show="loading && tree.length > 0" class="min-h-100px">
        <div v-if="loading && !tree.length" class="flex-col-stretch gap-16px px-8px py-12px" aria-busy="true">
          <NSkeleton text width="80%" />
          <NSkeleton text width="60%" class="ml-18px" />
          <NSkeleton text width="45%" class="ml-36px" />
        </div>
        <div
          v-else-if="failed"
          class="flex-col-stretch gap-12px px-8px py-16px text-13px text-base-text-3"
          role="alert"
        >
          {{ $t("page.manage.user.directory.loadFailed") }}
          <NButton size="small" @click="reload">{{ $t("common.refresh") }}</NButton>
        </div>
        <div v-else-if="searchPattern && tree.length" class="flex-col-stretch gap-4px">
          <div class="px-4px text-12px text-base-text-3" role="status">
            {{ $t("page.manage.user.directory.searchResults", { count: searchResults.length }) }}
          </div>
          <div
            v-for="result in searchResults"
            :key="result.department.id"
            class="department-search-row flex min-w-0 items-center gap-8px rd-6px px-6px py-8px"
            :class="{ active: selectedId === result.department.id }"
          >
            <button
              type="button"
              class="department-search-result min-w-0 flex-1 text-left"
              :data-department-result="result.department.id"
              :aria-pressed="selectedId === result.department.id"
              @click="locateDepartment(result.department.id)"
            >
              <NEllipsis :tooltip="{ placement: 'right' }"
                ><NHighlight :text="result.department.name" :patterns="[searchPattern]" /><template #tooltip>{{
                  result.department.name
                }}</template></NEllipsis
              >
              <NEllipsis class="block text-11px text-base-text-3" :tooltip="{ placement: 'right' }">{{
                result.path
                  .slice(0, -1)
                  .map((node) => node.name)
                  .join(" / ") || $t("page.manage.user.directory.allDepartments")
              }}</NEllipsis>
            </button>
            <span class="directory-count">{{ directoryOptions.byId.get(result.department.id)?.count ?? "—" }}</span>
          </div>
          <NEmpty
            v-if="!searchResults.length"
            size="small"
            class="py-24px"
            :description="$t('page.manage.user.directory.noResults')"
            role="status"
            ><template #extra
              ><NButton text type="primary" size="small" @click="keyword = ''">{{
                $t("page.manage.user.directory.clearSearch")
              }}</NButton></template
            ></NEmpty
          >
        </div>
        <NTree
          v-else-if="tree.length"
          :key="scopeId ?? 'all'"
          class="department-tree"
          :data="visibleOptions"
          :theme-overrides="{ nodeHeight: '40px', nodeWrapperPadding: '1px 0', nodeBorderRadius: '6px' }"
          :indent="18"
          :expanded-keys="visibleExpandedKeys"
          :selected-keys="visibleSelectedKeys"
          :render-suffix="renderDepartmentSuffix"
          :render-label="renderDepartmentLabel"
          :render-switcher-icon="renderSwitcherIcon"
          ellipsis
          block-line
          :expand-on-click="false"
          @update:expanded-keys="updateExpandedKeys"
          @update:selected-keys="
            (keys) => {
              if (keys.length) selectedId = String(keys[0])
            }
          "
        />
        <NEmpty
          v-else-if="!loading"
          size="small"
          class="py-24px"
          :description="$t('page.manage.user.directory.noDepartments')"
        />
      </NSpin>
    </div>
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
    background: transparent;
    color: rgb(var(--base-text-2-color));
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.2s,
      color 0.2s;
  }
  .directory-shortcut:hover {
    background: rgb(var(--base-text-4-color) / 0.12);
  }
  .directory-shortcut.active {
    color: rgb(var(--primary-color));
    background: rgb(var(--primary-color) / 0.1);
  }
  .directory-shortcut.active:hover {
    background: rgb(var(--primary-color) / 0.12);
  }
  .directory-count,
  .department-tree :deep(.directory-count) {
    @apply inline-flex h-22px w-30px shrink-0 items-center justify-center rd-5px text-12px text-base-text-3 tabular-nums;
    background: rgb(var(--base-text-4-color) / 0.16);
  }
  .directory-shortcut.active :deep(svg) {
    color: rgb(var(--primary-color));
  }
  .department-section {
    border-top: 1px solid rgb(var(--base-text-4-color) / 0.32);
  }
  .department-browse {
    border-bottom: 1px solid rgb(var(--base-text-4-color) / 0.32);
  }
  .department-browse :deep(.n-button__content) {
    min-width: 0;
  }
  .department-crumb {
    flex: 0 1 auto;
  }
  .department-search-result {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0;
  }
  .department-search-row:hover {
    background: rgb(var(--base-text-4-color) / 0.12);
  }
  .department-search-row.active {
    background: rgb(var(--primary-color) / 0.1);
    color: rgb(var(--primary-color));
  }
  .department-tree :deep(.department-enter) {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 18px;
    height: 24px;
    border-radius: 4px;
    background: rgb(var(--primary-color) / 0.06);
    transform: translate(-50%, -50%);
  }
  .department-tree :deep(.department-enter:hover) {
    background: rgb(var(--primary-color) / 0.12);
  }
  .department-tree :deep(.department-enter:focus-visible) {
    outline: 2px solid rgb(var(--primary-color));
    outline-offset: 1px;
  }
  .department-search :deep(.n-input-wrapper) {
    background: rgb(var(--base-text-4-color) / 0.08);
    border-radius: inherit;
  }
  .department-tree :deep(.n-tree-node-content) {
    padding-right: 8px;
  }
  .department-tree :deep(.n-tree-node-content__text) {
    min-width: 0;
  }
  .department-tree :deep(.n-tree-node-content__suffix) {
    flex-shrink: 0;
  }
  .department-tree :deep(.n-tree-node--selected)::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 2px;
    height: 16px;
    border-radius: 2px;
    background: rgb(var(--primary-color));
    transform: translateY(-50%);
  }
  .department-tree :deep(.n-tree-node--selected .n-tree-node-content),
  .department-tree :deep(.n-tree-node--selected .department-icon) {
    color: rgb(var(--primary-color));
    font-weight: 500;
  }
  .department-tree :deep(.n-tree-node--selected .directory-count) {
    color: rgb(var(--primary-color));
    background: rgb(var(--primary-color) / 0.06);
  }
  .department-section :deep(.n-highlight__mark) {
    color: rgb(var(--primary-color));
    background: rgb(var(--primary-color) / 0.12);
  }
  .department-tree :deep(.department-actions) {
    display: inline-flex;
    width: 24px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .department-tree :deep(.department-menu-button) {
    width: 24px;
    height: 28px;
    padding: 0;
  }
  .department-tree :deep(.n-tree-node:hover .department-actions),
  .department-tree :deep(.n-tree-node:focus-within .department-actions),
  .department-tree :deep(.n-tree-node--pending .department-actions),
  .department-tree :deep(.n-tree-node--selected .department-actions),
  .department-tree :deep(.department-actions.open) {
    opacity: 1;
  }
  .directory-shortcut:focus-visible {
    outline: 2px solid rgb(var(--primary-color));
    outline-offset: 2px;
  }
  @media (hover: none) {
    .department-tree :deep(.department-actions) {
      opacity: 1;
    }
  }
  @media (pointer: coarse) {
    .directory-heading {
      height: 44px;
    }
    .directory-heading :deep(.n-button),
    .department-tree :deep(.department-menu-button),
    .department-tree :deep(.department-enter) {
      width: 44px;
      height: 44px;
    }
    .department-tree :deep(.department-actions) {
      width: 44px;
    }
    .directory-shortcut .directory-count {
      margin-right: 48px;
    }
    .directory-shortcut {
      min-height: 44px;
    }
    .department-tree :deep(.n-tree-node-content),
    .department-tree :deep(.n-tree-node-switcher) {
      min-height: 44px;
    }
    .department-tree :deep(.n-tree-node-switcher) {
      min-width: 44px;
    }
    .department-search {
      min-height: 44px;
    }
    .department-search-result,
    .department-browse :deep(.n-button) {
      min-height: 44px;
    }
    .department-search :deep(.n-input__input-el) {
      font-size: 16px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .directory-shortcut,
    .department-tree :deep(.department-actions) {
      transition: none;
    }
  }
</style>
