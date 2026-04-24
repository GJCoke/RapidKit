<script setup lang="ts">
  import { computed, h, shallowRef, watch } from "vue"
  import type { TreeOption } from "naive-ui"
  import { NText } from "naive-ui"
  import {
    fetchGetBackendRouters,
    fetchGetMenuTree,
    fetchGetRolePermissions,
    fetchUpdateRolePermissions,
  } from "@/service/api"
  import { $t } from "@/locales"

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
  const checkedKeys = shallowRef<string[]>([])
  const indeterminateKeys = shallowRef<string[]>([])

  function handleCheckedKeysUpdate(keys: string[]) {
    checkedKeys.value = keys
  }

  function handleIndeterminateKeysUpdate(keys: Array<string | number>) {
    indeterminateKeys.value = keys.map(String)
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
    treeData.value = buildTree(
      menuRes.data.filter((item) => !item.constant),
      routerMap,
    )

    // Restore checked keys (only leaf nodes: btn + api)
    checkedKeys.value = [
      ...(permRes.data.buttonPermissions || []).map((k: string) => `btn:${k}`),
      ...(permRes.data.interfacePermissions || []).map((k: string) => `api:${k}`),
    ]
  }

  async function handleSubmit() {
    // Extract permissions by prefix
    const routerPermissions: string[] = []
    const buttonPermissions: string[] = []
    const interfacePermissions: string[] = []

    // Fully checked menu nodes
    for (const key of checkedKeys.value) {
      if (key.startsWith("menu:")) {
        routerPermissions.push(key.slice(5))
      } else if (key.startsWith("btn:")) {
        buttonPermissions.push(key.slice(4))
      } else if (key.startsWith("api:")) {
        interfacePermissions.push(key.slice(4))
      }
    }

    // Indeterminate (partially checked) menu nodes also count as router permissions
    for (const key of indeterminateKeys.value) {
      if (key.startsWith("menu:")) {
        routerPermissions.push(key.slice(5))
      }
    }

    const { error } = await fetchUpdateRolePermissions(props.roleId, {
      routerPermissions,
      buttonPermissions,
      interfacePermissions,
    })

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
      cascade
      expand-on-click
      block-line
      virtual-scroll
      class="h-480px"
      @update:checked-keys="handleCheckedKeysUpdate"
      @update:indeterminate-keys="handleIndeterminateKeysUpdate"
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
