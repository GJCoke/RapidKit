<script setup lang="tsx">
  import { reactive, ref } from "vue"
  import { NButton, NPopconfirm, NTag } from "naive-ui"
  import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
  import { userStatusRecord } from "@/constants/business"
  import {
    fetchBatchDeleteUsers,
    fetchDeleteUser,
    fetchGetDepartmentTree,
    fetchGetUserList,
    fetchResendInvite,
  } from "@/service/api"
  import { useAppStore } from "@/store/modules/app"
  import { defaultTransform, useNaivePaginatedTable, useTableOperate } from "@/hooks/common/table"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
  import { useAuthStore } from "@/store/modules/auth"
  import ImpersonationButton from "@/components/impersonation/impersonation-button.vue"
  import { createUserActionModel } from "./composables/user-actions"
  import UserOperateDrawer from "./modules/user-operate-drawer.vue"
  import ChangePasswordModal from "./modules/change-password-modal.vue"
  import UserSearch from "./modules/user-search.vue"
  import { createDepartmentMap } from "./composables/department-map"

  defineOptions({ name: "ManageUser" })
  const appStore = useAppStore()
  const { hasAuth, getActionContext } = useAuth()
  const authStore = useAuthStore()

  const deptMap = ref<Record<string, string>>({})

  async function loadDeptMap() {
    const { data, error } = await fetchGetDepartmentTree()
    if (error) return
    deptMap.value = createDepartmentMap(data)
  }

  loadDeptMap()

  const actions = useTableActions(createUserActionModel, () => getActionContext(appStore.locale, appStore.isMobile), (row) => row.id)

  const searchParams: Api.SystemManage.UserSearchParams = reactive({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    status: undefined,
    keyword: undefined,
  })

  const { columns, columnChecks, scrollX, data, getData, getDataByPage, loading, mobilePagination } = useNaivePaginatedTable({
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
        title: $t("page.manage.user.name"),
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
          if (row.status === null || row.status === undefined) {
            return null
          }

          const tagMap: Record<Api.SystemManage.UserStatus, NaiveUI.ThemeColor> = {
            1: "success",
            2: "warning",
            3: "info",
          }

          const label = $t(userStatusRecord[row.status])

          return <NTag type={tagMap[row.status]}>{label}</NTag>
        },
      },
      ...actions.column({
        key: "operate",
        title: $t("common.operate"),
        render: (row) => (
          <div class="flex items-center justify-start flex-nowrap gap-8px whitespace-nowrap">
            {actions.visible(row, "impersonate") && (<ImpersonationButton user={row} departmentName={row.departmentId ? deptMap.value[row.departmentId] : undefined} />)}
            {actions.visible(row, "edit") && (
              <NButton type="primary" ghost size="small" onClick={() => edit(row.id)}>
                {$t("common.edit")}
              </NButton>
            )}
            {actions.visible(row, "password") && (
              <NButton type="warning" ghost size="small" onClick={() => handleChangePassword(row)}>
                {$t("page.manage.user.changePassword")}
              </NButton>
            )}
            {actions.visible(row, "resend") && (
              <NButton type="info" ghost size="small" onClick={() => actions.run(() => data.value.find((item) => item.id === row.id), "resend", (latest) => handleResendInvite(latest.id))}>
                {$t("page.manage.user.resendInvite")}
              </NButton>
            )}
            {actions.visible(row, "delete") && (
              <NPopconfirm onPositiveClick={() => actions.run(() => data.value.find((item) => item.id === row.id), "delete", (latest) => handleDelete(latest.id))}>
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
      }),
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

  async function handleResendInvite(id: string) {
    const { error } = await fetchResendInvite(id)
    if (error) return
    window.$message?.success($t("page.manage.user.resendInviteSuccess"))
  }

  async function handleBatchDelete() {
    if (!hasAuth("user:delete")) return
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
        <TableHeaderOperation
          :show-business-actions="hasAuth('user:create') || hasAuth('user:delete')"
          v-model:columns="columnChecks"
          :loading="loading"
          @refresh="getData"
        >
          <NButton v-if="hasAuth('user:create')" size="small" ghost type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            {{ $t("common.add") }}
          </NButton>
          <NPopconfirm v-if="hasAuth('user:delete')" @positive-click="handleBatchDelete">
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
        :scroll-x="scrollX"
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
