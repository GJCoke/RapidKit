<script setup lang="ts">
  import { computed, h, ref, shallowRef } from "vue"
  import type { TreeOption } from "naive-ui"
  import { NButton, NDropdown, NEllipsis, NHighlight } from "naive-ui"
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
  const searchPattern = computed(() => keyword.value.trim())
  const openMenuId = ref<string | null>(null)
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
        return {
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

  function renderDepartmentLabel({ option }: { option: TreeOption }) {
    return h(
      NEllipsis,
      { tooltip: { placement: "right", delay: 400 } },
      {
        default: () =>
          h(NHighlight, {
            text: String(option.label),
            patterns: searchPattern.value ? [searchPattern.value] : [],
          }),
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
    <div class="department-section flex-col-stretch gap-8px pt-14px">
      <h3 class="m-0 px-4px text-12px font-normal text-base-text-3">
        {{ $t("page.manage.user.directory.organization") }}
      </h3>
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
        <NTree
          v-else-if="tree.length"
          class="department-tree"
          :data="options"
          :theme-overrides="{ nodeHeight: '40px', nodeWrapperPadding: '1px 0', nodeBorderRadius: '6px' }"
          :indent="18"
          :pattern="searchPattern"
          :show-irrelevant-nodes="false"
          :selected-keys="[selectedId]"
          :render-suffix="renderDepartmentSuffix"
          :render-label="renderDepartmentLabel"
          ellipsis
          block-line
          default-expand-all
          :expand-on-click="false"
          @update:selected-keys="
            (keys) => {
              if (keys.length) selectedId = String(keys[0])
            }
          "
        >
          <template #empty>
            <NEmpty
              size="small"
              class="py-24px"
              :description="$t('page.manage.user.directory.noResults')"
              role="status"
            >
              <template #extra
                ><NButton text type="primary" size="small" @click="keyword = ''">{{
                  $t("page.manage.user.directory.clearSearch")
                }}</NButton></template
              >
            </NEmpty>
          </template>
        </NTree>
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
  .department-tree :deep(.n-highlight__mark) {
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
    .department-tree :deep(.department-menu-button) {
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
