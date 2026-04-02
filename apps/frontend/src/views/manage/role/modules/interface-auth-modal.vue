<script setup lang="ts">
  import { computed, shallowRef, watch } from "vue"
  import type { TreeOption } from "naive-ui"
  import {
    fetchGetBackendRouters,
    fetchGetMenuTree,
    fetchGetRolePermissions,
    fetchUpdateInterfacePermissions,
  } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({
    name: "InterfaceAuthModal",
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

  const title = computed(() => $t("common.edit") + $t("page.manage.role.interfaceAuth"))

  const treeData = shallowRef<TreeOption[]>([])
  const checks = shallowRef<string[]>([])

  async function loadTreeData() {
    const [menuRes, routerRes] = await Promise.all([fetchGetMenuTree(), fetchGetBackendRouters()])

    if (menuRes.error || routerRes.error) return

    const routerMap = new Map<string, Api.SystemManage.BackendRouter>()
    for (const r of routerRes.data) {
      routerMap.set(r.code, r)
    }

    const nodes: TreeOption[] = []

    function processMenus(menus: Api.SystemManage.MenuTree[]) {
      for (const menu of menus) {
        const menuData = menu as unknown as { interfaces?: string[] }
        if (menuData.interfaces && menuData.interfaces.length > 0) {
          const children: TreeOption[] = menuData.interfaces.map((code) => {
            const router = routerMap.get(code)
            return {
              key: code,
              label: router ? `[${router.methods.join(",")}] ${router.path} — ${router.name}` : code,
            }
          })
          nodes.push({
            key: `menu:${menu.routeName}`,
            label: menu.menuName,
            children,
          })
        }
        if (menu.children) {
          processMenus(menu.children)
        }
      }
    }

    processMenus(menuRes.data)
    treeData.value = nodes
  }

  async function getChecks() {
    const { error, data } = await fetchGetRolePermissions(props.roleId)
    if (!error) {
      checks.value = data.interfacePermissions || []
    }
  }

  async function handleSubmit() {
    const interfaceCodes = checks.value.filter((key) => !key.startsWith("menu:"))

    const { error } = await fetchUpdateInterfacePermissions(props.roleId, interfaceCodes)
    if (error) return

    window.$message?.success?.($t("common.modifySuccess"))
    closeModal()
  }

  function init() {
    loadTreeData()
    getChecks()
  }

  watch(visible, (val) => {
    if (val) {
      init()
    }
  })
</script>

<template>
  <NModal v-model:show="visible" :title="title" preset="card" class="w-560px">
    <NTree
      v-model:checked-keys="checks"
      :data="treeData"
      checkable
      cascade
      expand-on-click
      block-line
      virtual-scroll
      :default-expand-all="true"
      class="h-360px"
    />
    <template #footer>
      <NSpace justify="end">
        <NButton size="small" class="mt-16px" @click="closeModal">
          {{ $t("common.cancel") }}
        </NButton>
        <NButton type="primary" size="small" class="mt-16px" @click="handleSubmit">
          {{ $t("common.confirm") }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped></style>
