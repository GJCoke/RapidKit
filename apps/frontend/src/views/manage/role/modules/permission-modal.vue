<script setup lang="ts">
  import { computed, shallowRef, watch } from "vue"
  import type { TreeOption } from "naive-ui"
  import {
    fetchGetBackendRouters,
    fetchGetMenuTree,
    fetchGetRolePermissions,
    fetchUpdateRolePermissions,
  } from "@/service/api"
  import { $t } from "@/locales"
  import {
    buildPermissionCheckedKeys,
    normalizePermissionSelection,
  } from "./permission-selection"

  defineOptions({
    name: "PermissionModal",
  })

  interface Props {
    roleId: string
  }

  const props = defineProps<Props>()

  const visible = defineModel<boolean>("visible", {
    default: false,
  })

  function closeModal() {
    visible.value = false
  }

  const title = computed(() => $t("page.manage.role.permissionConfig"))

  const treeData = shallowRef<TreeOption[]>([])
  const permissionMenus = shallowRef<Api.SystemManage.MenuTree[]>([])
  const checkedKeys = shallowRef<string[]>([])

  function handleCheckedKeysUpdate(keys: string[]) {
    checkedKeys.value = keys
  }

  function buildTree(
    menus: Api.SystemManage.MenuTree[],
    routerMap: Map<string, Api.SystemManage.BackendRouter>,
  ): TreeOption[] {
    return menus.map((menu) => {
      const node: TreeOption = {
        key: `menu:${menu.routeName}`,
        label: menu.menuName,
        children: [],
      }

      // Recurse child menus first
      if (menu.children && menu.children.length > 0) {
        node.children = buildTree(menu.children, routerMap)
      }

      // Append button group
      if (menu.buttons && menu.buttons.length > 0) {
        const btnChildren: TreeOption[] = menu.buttons.map((btn) => ({
          key: `btn:${btn.code}`,
          label: btn.desc,
        }))
        node.children!.push({
          key: `group:btn:${menu.routeName}`,
          label: $t("page.manage.role.buttonAuth"),
          checkboxDisabled: true,
          children: btnChildren,
        })
      }

      // Append interface group
      if (menu.interfaces && menu.interfaces.length > 0) {
        const apiChildren: TreeOption[] = menu.interfaces.map((code) => {
          const router = routerMap.get(code)
          const label = router ? `[${router.methods.join(",")}] ${router.path} — ${router.name}` : code
          return {
            key: `api:${code}`,
            label,
          }
        })
        node.children!.push({
          key: `group:api:${menu.routeName}`,
          label: $t("page.manage.role.interfaceAuth"),
          checkboxDisabled: true,
          children: apiChildren,
        })
      }

      // Remove empty children array
      if (node.children!.length === 0) {
        delete node.children
      }

      return node
    })
  }

  async function loadData() {
    checkedKeys.value = []
    treeData.value = []
    permissionMenus.value = []

    const [menuRes, routerRes, permRes] = await Promise.all([
      fetchGetMenuTree(),
      fetchGetBackendRouters(),
      fetchGetRolePermissions(props.roleId),
    ])

    if (menuRes.error || routerRes.error || permRes.error) return

    // Build router map
    const routerMap = new Map<string, Api.SystemManage.BackendRouter>()
    for (const r of routerRes.data) {
      routerMap.set(r.code, r)
    }

    // Build tree
    permissionMenus.value = menuRes.data.filter((item) => !item.constant)
    treeData.value = buildTree(permissionMenus.value, routerMap)

    checkedKeys.value = buildPermissionCheckedKeys(permRes.data)
  }

  async function handleSubmit() {
    const permissions = normalizePermissionSelection(checkedKeys.value, permissionMenus.value)
    const { error } = await fetchUpdateRolePermissions(props.roleId, permissions)

    if (error) return

    window.$message?.success?.($t("common.modifySuccess"))
    closeModal()
  }

  watch(visible, (val) => {
    if (val) {
      loadData()
    }
  })
</script>

<template>
  <NModal v-model:show="visible" :title="title" preset="card" class="w-640px">
    <NTree
      :checked-keys="checkedKeys"
      :data="treeData"
      checkable
      expand-on-click
      block-line
      virtual-scroll
      class="h-480px"
      @update:checked-keys="handleCheckedKeysUpdate"
    />
    <template #footer>
      <NSpace justify="end">
        <NButton size="small" @click="closeModal">
          {{ $t("common.cancel") }}
        </NButton>
        <NButton type="primary" size="small" @click="handleSubmit">
          {{ $t("common.confirm") }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped></style>
