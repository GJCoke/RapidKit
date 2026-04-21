<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { enableStatusRecord } from "@/constants/business"
  import { fetchBatchDeleteUsers, fetchDeleteUser, fetchGetDepartmentTree, fetchGetUserList } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { useAuthStore } from "@/store/modules/auth"
  import UserOperateDrawer from "./modules/user-operate-drawer.vue"
  import ChangePasswordModal from "./modules/change-password-modal.vue"
  import UserSearch from "./modules/user-search.vue"

  const appStore = useAppStore()
  const { hasAuth } = useAuth()
  const authStore = useAuthStore()

  const deptMap = ref<Record<string, string>>({})

  function flattenDeptTree(tree: Api.SystemManage.DepartmentTree[], map: Record<string, string>) {
    for (const node of tree) {
      map[node.id] = node.name
      if (node.children?.length) flattenDeptTree(node.children, map)
    }
  }

  async function loadDeptMap() {
    const { data, error } = await fetchGetDepartmentTree()
    if (error) return
    const map: Record<string, string> = {}
    flattenDeptTree(data, map)
    deptMap.value = map
  }

  loadDeptMap()

  const searchParams: Api.SystemManage.UserSearchParams = reactive({
    page: 1,
    pageSize: 10,
    status: null,
    keyword: null,
  })

  const { columns, columnChecks, data, getData, getDataByPage, loading, mobilePagination } = useNaivePaginatedTable({
    api: () => fetchGetUserList(searchParams),
    transform: (response) => defaultTransform(response),
    onPaginationParamsChange: (params) => {
      searchParams.page = params.page
      searchParams.pageSize = params.pageSize
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
        align: "center",
        width: 64,
        render: (_, index) => index + 1,
      },
      {
        key: "username",
        title: $t("page.manage.user.username"),
        align: "center",
        minWidth: 100,
      },
      {
        key: "name",
        title: "Name",
        align: "center",
        minWidth: 100,
      },
      {
        key: "email",
        title: "Email",
        align: "center",
        minWidth: 200,
      },
      {
        key: "roles",
        title: $t("page.manage.user.userRole"),
        align: "center",
        minWidth: 150,
        render: (row) => {
          if (!row.roles || row.roles.length === 0) return null
          return row.roles.map((role: string) => (
            <NTag key={role} size="small" class="mr-4px">
              {role}
            </NTag>
          ))
        },
      },
      {
        key: "departmentId",
        title: $t("page.manage.department.column"),
        align: "center",
        minWidth: 120,
        render: (row) => {
          if (!row.departmentId) return null
          const name = deptMap.value[row.departmentId] || row.departmentId
          return <NTag size="small">{name}</NTag>
        },
      },
      {
        key: "status",
        title: $t("page.manage.user.userStatus"),
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
            {hasAuth("manage_user:edit") && (
              <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
                {$t("common.edit")}
              </NButton>
            )}
            {hasAuth("manage_user:password") && (authStore.userInfo.isAdmin || row.id === authStore.userInfo.id) && (
              <NButton type="warning" ghost size="small" onClick={() => handleChangePassword(row)}>
                {$t("page.manage.user.changePassword")}
              </NButton>
            )}
            {hasAuth("manage_user:delete") && (
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

  const passwordModal = reactive({ visible: false, userId: "", isSelf: false })

  function handleChangePassword(row: Api.SystemManage.User) {
    passwordModal.userId = row.id
    passwordModal.isSelf = row.id === authStore.userInfo.id
    passwordModal.visible = true
  }

  async function handleBatchDelete() {
    const { error } = await fetchBatchDeleteUsers(checkedRowKeys.value as string[])
    if (error) return
    onBatchDeleted()
  }

  async function handleDelete(id: string) {
    const { error } = await fetchDeleteUser(id)
    if (error) return
    onDeleted()
  }

  function edit(id: string) {
    handleEdit(id)
  }
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <UserSearch v-model:model="searchParams" @search="getDataByPage" />
    <NCard :title="$t('page.manage.user.title')" :bordered="false" size="small" class="card-wrapper sm:flex-1-hidden">
      <template #header-extra>
        <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
          <NButton v-if="hasAuth('manage_user:add')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
          <NPopconfirm v-if="hasAuth('manage_user:delete')" @positive-click="handleBatchDelete">
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
        :scroll-x="982"
        :loading="loading"
        remote
        :row-key="(row) => row.id"
        :pagination="mobilePagination"
        class="sm:h-full"
      />
      <UserOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
      <ChangePasswordModal
        v-model:visible="passwordModal.visible"
        :user-id="passwordModal.userId"
        :is-self="passwordModal.isSelf"
      />
    </NCard>
  </div>
</template>

<style scoped></style>
