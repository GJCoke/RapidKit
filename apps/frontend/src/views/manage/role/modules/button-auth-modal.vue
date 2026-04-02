<script setup lang="ts">
  import { computed, shallowRef, watch } from "vue"
  import { fetchGetMenuTree, fetchGetRolePermissions, fetchUpdateButtonPermissions } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({
    name: "ButtonAuthModal",
  })

  interface Props {
    /** the roleId */
    roleId: string
  }

  const props = defineProps<Props>()

  const visible = defineModel<boolean>("visible", {
    default: false,
  })

  function closeModal() {
    visible.value = false
  }

  const title = computed(() => $t("common.edit") + $t("page.manage.role.buttonAuth"))

  type ButtonConfig = {
    id: string
    label: string
    code: string
  }

  const tree = shallowRef<ButtonConfig[]>([])

  async function getAllButtons() {
    const { error, data } = await fetchGetMenuTree()

    if (!error) {
      // Extract buttons from all menus in the tree
      const buttons: ButtonConfig[] = []

      function extractButtons(menus: Api.SystemManage.MenuTree[]) {
        for (const menu of menus) {
          // MenuTree doesn't have buttons directly, but the menu data from the tree endpoint does
          const menuData = menu as unknown as { buttons?: { code: string; desc: string }[] }
          if (menuData.buttons) {
            for (const btn of menuData.buttons) {
              buttons.push({
                id: btn.code,
                label: btn.desc,
                code: btn.code,
              })
            }
          }
          if (menu.children) {
            extractButtons(menu.children)
          }
        }
      }

      extractButtons(data)
      tree.value = buttons
    }
  }

  const checks = shallowRef<string[]>([])

  async function getChecks() {
    const { error, data } = await fetchGetRolePermissions(props.roleId)

    if (!error) {
      checks.value = data.buttonPermissions || []
    }
  }

  async function handleSubmit() {
    const { error } = await fetchUpdateButtonPermissions(props.roleId, checks.value)

    if (error) return

    window.$message?.success?.($t("common.modifySuccess"))

    closeModal()
  }

  function init() {
    getAllButtons()
    getChecks()
  }

  watch(visible, (val) => {
    if (val) {
      init()
    }
  })
</script>

<template>
  <NModal v-model:show="visible" :title="title" preset="card" class="w-480px">
    <NTree
      v-model:checked-keys="checks"
      :data="tree"
      key-field="id"
      block-line
      checkable
      expand-on-click
      virtual-scroll
      class="h-280px"
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
