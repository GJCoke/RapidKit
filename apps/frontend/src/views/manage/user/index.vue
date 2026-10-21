<script setup lang="tsx">
  import { computed, reactive, ref, watch } from "vue"
  import { NAvatar, NButton, NDropdown, NTag } from "naive-ui"
  import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
  import { userStatusRecord } from "@/constants/business"
  import { fetchBatchDeleteUsers, fetchDeleteUser, fetchGetUserList, fetchResendInvite } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { useAuthStore } from "@/store/modules/auth"
  import SvgIcon from "@/components/custom/svg-icon.vue"
  import ImpersonationConfirmModal from "@/components/impersonation/impersonation-confirm-modal.vue"
  import { createUserActionModel } from "./composables/user-actions"
  import UserOperateDrawer from "./modules/user-operate-drawer.vue"
  import ChangePasswordModal from "./modules/change-password-modal.vue"
  import UserSearch from "./modules/user-search.vue"
  import DepartmentPanel from "./modules/department-panel.vue"

  defineOptions({ name: "ManageUser" })
  const appStore = useAppStore()
  const { hasAuth, getActionContext } = useAuth()
  const authStore = useAuthStore()
  const selectedDepartment = ref("all")
  const departmentPanel = ref<InstanceType<typeof DepartmentPanel>>()
  const mobileDepartments = ref(false)
  const departmentNames = ref<Record<string, string>>({})
  const departmentPaths = ref<Record<string, string>>({})
  const searchParams: Api.SystemManage.UserSearchParams = reactive({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    status: null,
    keyword: "",
  })
  const actions = useTableActions(
    createUserActionModel,
    () => getActionContext(appStore.locale, appStore.isMobile),
    (row) => row.id,
  )
  const contextTitle = computed(() =>
    selectedDepartment.value === "all"
      ? $t("page.manage.user.directory.allUsers")
      : selectedDepartment.value === "unassigned"
        ? $t("page.manage.user.directory.unassigned")
        : (departmentNames.value[selectedDepartment.value] ?? "—"),
  )

  let latestRequest: ReturnType<typeof fetchGetUserList>
  async function fetchUsers() {
    latestRequest = fetchGetUserList({ ...searchParams })
    let current = latestRequest
    let response = await current
    // The shared table accepts every response. Older requests must resolve to the latest result.
    while (current !== latestRequest) {
      current = latestRequest
      response = await current
    }
    return response
  }

  const { columns, columnChecks, scrollX, data, getData, getDataByPage, loading, mobilePagination, pagination } =
    useNaivePaginatedTable({
      immediate: false,
      api: fetchUsers,
      transform: (response) => defaultTransform(response),
      onPaginationParamsChange: (params) => {
        searchParams.page = params.page
        searchParams.pageSize = params.pageSize
      },
      columns: () => [
        { type: "selection", width: 36 },
        {
          key: "username",
          title: $t("page.manage.user.directory.identity"),
          minWidth: 130,
          render: (row) => (
            <div class="flex items-center gap-10px py-8px">
              <NAvatar round size={32} src={row.avatar || undefined} class="shrink-0 bg-primary-50 text-primary">
                {(row.name || row.username).slice(0, 1)}
              </NAvatar>
              <div class="min-w-0">
                <div class="truncate font-medium" title={row.name}>
                  {row.name || "—"}
                </div>
                <div class="truncate text-12px text-base-text-3" title={row.username}>
                  {row.username}
                </div>
              </div>
            </div>
          ),
        },
        {
          key: "email",
          title: $t("page.manage.user.userEmail"),
          minWidth: 170,
          ellipsis: { tooltip: true },
          render: (row) => row.email ?? "—",
        },
        {
          key: "departmentId",
          title: $t("page.manage.department.column"),
          minWidth: 110,
          ellipsis: { tooltip: true },
          render: (row) =>
            row.departmentId
              ? (departmentPaths.value[row.departmentId] ?? "—")
              : $t("page.manage.user.directory.unassigned"),
        },
        {
          key: "roles",
          title: $t("page.manage.user.userRole"),
          minWidth: 90,
          render: (row) => (
            <div class="flex flex-wrap gap-4px">
              {row.roles?.map((role) => (
                <NTag key={role} size="small" bordered={false}>
                  {role}
                </NTag>
              ))}
            </div>
          ),
        },
        {
          key: "status",
          title: $t("page.manage.user.userStatus"),
          width: 80,
          render: (row) =>
            row.status ? (
              <span class={["user-status", `status-${row.status}`]}>{$t(userStatusRecord[row.status])}</span>
            ) : (
              "—"
            ),
        },
        ...actions.column({
          key: "operate",
          title: $t("common.operate"),
          fixed: "right",
          render: (row) => (
            <div class="flex items-center gap-8px whitespace-nowrap">
              {actions.visible(row, "edit") && (
                <NButton
                  text
                  type="primary"
                  size="small"
                  onClick={() =>
                    actions.run(
                      () => data.value.find((item) => item.id === row.id),
                      "edit",
                      (latest) => handleEdit(latest.id),
                    )
                  }
                >
                  {$t("common.edit")}
                </NButton>
              )}
              {actions.rowEntries(row).some((entry) => entry.kind === "menu") && (
                <NDropdown
                  trigger="click"
                  options={userMenu(row)}
                  onSelect={(key: string) => selectUserAction(row.id, key)}
                >
                  <NButton quaternary size="small" style="width:32px" aria-label={$t("page.manage.user.directory.more")}>
                    {{ icon: () => <SvgIcon icon="ic:round-more-horiz" /> }}
                  </NButton>
                </NDropdown>
              )}
            </div>
          ),
        }),
      ],
    })

  const { drawerVisible, operateType, editingData, handleAdd, handleEdit, checkedRowKeys } = useTableOperate(
    data,
    "id",
    getData,
  )
  const passwordModal = reactive({ visible: false, userId: "", isSelf: false })
  const impersonationId = ref<string | null>(null)
  const impersonationVisible = ref(false)
  const impersonationUser = computed(() => data.value.find((row) => row.id === impersonationId.value))
  const menuLabels: Record<string, I18nFullKey> = {
    password: "page.manage.user.changePassword",
    resend: "page.manage.user.resendInvite",
    delete: "common.delete",
    impersonate: "page.manage.user.impersonation.start",
  }

  function userMenu(row: Api.SystemManage.User) {
    return actions
      .rowEntries(row)
      .filter((entry) => entry.kind === "menu")
      .flatMap((entry) => entry.actions)
      .map((key) => ({ key, label: $t(menuLabels[key]), disabled: !actions.enabled(row, key) }))
  }

  async function selectUserAction(id: string, key: string) {
    await actions.run(
      () => data.value.find((row) => row.id === id),
      key,
      async (row) => {
        if (key === "password") {
          passwordModal.userId = row.id
          passwordModal.isSelf = row.id === authStore.userInfo.id
          passwordModal.visible = true
        } else if (key === "impersonate") {
          impersonationId.value = row.id
          impersonationVisible.value = true
        } else if (key === "resend") {
          const { error } = await fetchResendInvite(row.id)
          if (!error) window.$message?.success($t("page.manage.user.resendInviteSuccess"))
        } else if (key === "delete") {
          window.$dialog?.warning({
            title: $t("common.confirm"),
            content: $t("common.confirmDelete"),
            positiveText: $t("common.confirm"),
            negativeText: $t("common.cancel"),
            onPositiveClick: () =>
              actions.run(
                () => data.value.find((item) => item.id === id),
                "delete",
                async (latest) => {
                  const { error } = await fetchDeleteUser(latest.id)
                  if (error) return false
                  window.$message?.success($t("common.deleteSuccess"))
                  await refreshAfterWrite()
                  return true
                },
              ),
          })
        }
      },
    )
  }

  watch(
    () => impersonationUser.value && actions.enabled(impersonationUser.value, "impersonate"),
    (allowed) => {
      if (!allowed) impersonationVisible.value = false
    },
  )

  function onDepartmentsLoaded(tree: Api.SystemManage.DepartmentTree[]) {
    const names: Record<string, string> = {}
    const paths: Record<string, string> = {}
    function visit(nodes: Api.SystemManage.DepartmentTree[], ancestors: string[]) {
      for (const node of nodes) {
        names[node.id] = node.name
        paths[node.id] = [...ancestors, node.name].join(" / ")
        visit(node.children ?? [], [...ancestors, node.name])
      }
    }
    visit(tree, [])
    departmentNames.value = names
    departmentPaths.value = paths
  }

  function search() {
    checkedRowKeys.value = []
    data.value = []
    return getDataByPage()
  }

  watch(selectedDepartment, (id) => {
    searchParams.departmentId = id !== "all" && id !== "unassigned" ? id : undefined
    searchParams.unassigned = id === "unassigned" || undefined
    searchParams.includeChildren = true
    mobileDepartments.value = false
    search()
  })

  async function refreshAfterWrite() {
    checkedRowKeys.value = []
    await Promise.all([getDataByPage(), departmentPanel.value?.reload()])
  }

  async function handleBatchDelete() {
    if (!hasAuth("user:delete") || !checkedRowKeys.value.length) return
    const { error } = await fetchBatchDeleteUsers([...checkedRowKeys.value])
    if (error) return false
    window.$message?.success($t("common.deleteSuccess"))
    await refreshAfterWrite()
    return true
  }

  getData()
</script>

<template>
  <div class="user-directory min-h-500px flex-col-stretch gap-20px overflow-hidden lt-sm:overflow-auto">
    <div class="directory-workspace min-h-0 flex flex-1 overflow-hidden rd-8px bg-container">
      <div class="department-rail shrink-0" :class="{ 'mobile-open': mobileDepartments }">
        <DepartmentPanel
          ref="departmentPanel"
          v-model:selected-id="selectedDepartment"
          @loaded="onDepartmentsLoaded"
          @changed="search"
        />
      </div>
      <section
        class="user-table-pane min-w-0 flex flex-1 flex-col gap-16px p-20px"
        :aria-label="$t('page.manage.user.title')"
      >
        <div class="flex flex-wrap items-start justify-between gap-12px">
          <div>
            <h2 class="m-0 text-17px font-semibold">{{ contextTitle }}</h2>
            <div class="mt-4px text-13px text-base-text-3">
              {{ $t("page.manage.user.directory.members", { count: pagination.itemCount ?? 0 }) }}
            </div>
          </div>
          <TableHeaderOperation
            v-model:columns="columnChecks"
            :loading="loading"
            :show-business-actions="hasAuth('user:create')"
            @refresh="refreshAfterWrite"
          >
            <NButton v-if="hasAuth('user:create')" size="small" type="primary" @click="handleAdd">
              <template #icon><icon-ic-round-plus /></template>{{ $t("page.manage.user.addUser") }}
            </NButton>
          </TableHeaderOperation>
        </div>
        <NButton
          v-if="appStore.isMobile"
          size="small"
          :aria-expanded="mobileDepartments"
          @click="mobileDepartments = !mobileDepartments"
        >
          {{ $t("page.manage.user.directory.showDepartments") }}
        </NButton>
        <UserSearch :model="searchParams" @search="search" />
        <div
          v-if="checkedRowKeys.length"
          class="flex flex-wrap items-center gap-12px rd-6px bg-theme-fill px-12px py-8px"
        >
          <span class="text-13px">{{
            $t("page.manage.user.directory.selected", { count: checkedRowKeys.length })
          }}</span>
          <NButton text type="primary" size="small" @click="checkedRowKeys = []">{{
            $t("page.manage.user.directory.clearSelection")
          }}</NButton>
          <NPopconfirm v-if="hasAuth('user:delete')" @positive-click="handleBatchDelete">
            <template #trigger
              ><NButton size="small" type="error" ghost>{{ $t("common.batchDelete") }}</NButton></template
            >
            {{ $t("common.confirmDelete") }}
          </NPopconfirm>
        </div>
        <NDataTable
          v-model:checked-row-keys="checkedRowKeys"
          :columns="columns"
          :data="data"
          size="small"
          :flex-height="!appStore.isMobile"
          :scroll-x="scrollX"
          :loading="loading"
          remote
          :row-key="(row) => row.id"
          :pagination="mobilePagination"
          class="min-h-0 flex-1"
        />
      </section>
    </div>
    <UserOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      :department-id="selectedDepartment !== 'all' && selectedDepartment !== 'unassigned' ? selectedDepartment : null"
      @submitted="refreshAfterWrite"
    />
    <ChangePasswordModal
      v-model:visible="passwordModal.visible"
      :user-id="passwordModal.userId"
      :is-self="passwordModal.isSelf"
    />
    <ImpersonationConfirmModal
      v-if="impersonationUser"
      v-model:show="impersonationVisible"
      :user="impersonationUser"
      :department-name="impersonationUser.departmentId ? departmentNames[impersonationUser.departmentId] : undefined"
    />
  </div>
</template>

<style scoped>
  .directory-workspace {
    border: 1px solid rgb(var(--base-text-4-color) / 0.4);
  }
  .department-rail {
    width: 256px;
    overflow: auto;
    border-right: 1px solid rgb(var(--base-text-4-color) / 0.4);
  }
  .user-table-pane :deep(.n-data-table-th) {
    font-weight: 500;
  }
  .user-table-pane :deep(.n-data-table-td) {
    height: 64px;
  }
  :deep(.user-status) {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
    font-size: 13px;
  }
  :deep(.user-status)::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgb(var(--warning-color));
  }
  :deep(.status-1)::before {
    background: rgb(var(--success-color));
  }
  :deep(.status-2)::before {
    background: rgb(var(--base-text-3-color));
  }
  @media (max-width: 639px) {
    .directory-workspace {
      flex-direction: column;
      overflow: visible;
    }
    .department-rail {
      display: none;
      width: 100%;
      max-height: 340px;
      border-right: 0;
      border-bottom: 1px solid rgb(var(--base-text-4-color) / 0.4);
    }
    .department-rail.mobile-open {
      display: block;
    }
    .user-table-pane {
      padding: 16px;
      min-height: 450px;
    }
  }
</style>
