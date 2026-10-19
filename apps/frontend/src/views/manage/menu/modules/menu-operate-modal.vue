<script setup lang="tsx">
  import { computed, ref, shallowRef, watch } from "vue"
  import type { SelectOption } from "naive-ui"
  import { useOperationAccess } from "@/hooks/business/table-actions/use-operation-access"
  import { enableStatusOptions, menuIconTypeOptions, menuTypeOptions } from "@/constants/business"
  import { fetchCreateMenu, fetchGetActiveMenuOptions, fetchGetPermissionCatalog, fetchUpdateMenu } from "@/service/api"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { getLocalIcons } from "@/utils/icon"
  import { $t } from "@/locales"
  import SvgIcon from "@/components/custom/svg-icon.vue"
  import { createActiveMenuOptionsLoader, watchActiveMenuPartition } from "./active-menu-options"
  import { buildPermissionCodeOptions, requiresMenuPermission } from "./permission-options"
  import {
    getLayoutAndPage,
    getPathParamFromRoutePath,
    getRoutePathByRouteName,
    getRoutePathWithParam,
    transformLayoutAndPageToComponent,
  } from "./shared"

  defineOptions({
    name: "MenuOperateModal",
  })

  export type OperateType = NaiveUI.TableOperateType | "addChild"

  interface Props {
    /** the type of operation */
    operateType: OperateType
    /** the edit menu data or the parent menu data when adding a child menu */
    rowData?: Api.SystemManage.Menu | null
    /** all pages */
    allPages: string[]
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "submitted"): void
  }

  const emit = defineEmits<Emits>()

  const visible = defineModel<boolean>("visible", {
    default: false,
  })
  const operationAccess = useOperationAccess(() => props.operateType === "edit" ? "menu:update" : "menu:create", visible)

  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const title = computed(() => {
    const titles: Record<OperateType, string> = {
      add: $t("page.manage.menu.addMenu"),
      addChild: $t("page.manage.menu.addChildMenu"),
      edit: $t("page.manage.menu.editMenu"),
    }
    return titles[props.operateType]
  })

  type Model = Pick<
    Api.SystemManage.Menu,
    | "menuType"
    | "menuName"
    | "routeName"
    | "routePath"
    | "component"
    | "order"
    | "i18nKey"
    | "icon"
    | "iconType"
    | "status"
    | "parentId"
    | "keepAlive"
    | "constant"
    | "href"
    | "hideInMenu"
    | "activeMenu"
    | "multiTab"
    | "fixedIndexInTab"
    | "permission"
  > & {
    query: NonNullable<Api.SystemManage.Menu["query"]>
    layout: string
    page: string
    pathParam: string
  }

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      menuType: "1",
      menuName: "",
      routeName: "",
      routePath: "",
      pathParam: "",
      component: "",
      layout: "",
      page: "",
      i18nKey: null,
      icon: "",
      iconType: "1",
      parentId: null,
      status: "1",
      keepAlive: false,
      constant: false,
      order: 0,
      href: null,
      hideInMenu: false,
      activeMenu: null,
      multiTab: false,
      fixedIndexInTab: null,
      query: [],
      permission: null,
    }
  }

  const showPermission = computed(() => requiresMenuPermission(model.value.menuType, model.value.constant === true))

  type RuleKey = Extract<keyof Model, "menuName" | "status" | "routeName" | "routePath" | "permission">

  const rules: Record<RuleKey, App.Global.FormRule> = {
    menuName: defaultRequiredRule,
    status: defaultRequiredRule,
    routeName: defaultRequiredRule,
    routePath: defaultRequiredRule,
    permission: {
      trigger: ["blur", "change"],
      validator: () =>
        !showPermission.value || model.value.permission ? true : new Error($t("page.manage.menu.form.permission")),
    },
  }

  const disabledMenuType = computed(() => props.operateType === "edit")

  const localIcons = getLocalIcons()
  const localIconOptions = localIcons.map<SelectOption>((item) => ({
    label: () => (
      <div class="flex-y-center gap-16px">
        <SvgIcon localIcon={item} class="text-icon" />
        <span>{item}</span>
      </div>
    ),
    value: item,
  }))

  const permissionCatalog = shallowRef<Api.Permission.Catalog | null>(null)
  const { activeMenuOptions, load: loadActiveMenuOptions } = createActiveMenuOptionsLoader(fetchGetActiveMenuOptions)
  let hydratingModel = false

  async function getPermissionCatalog() {
    const { error, data } = await fetchGetPermissionCatalog()
    if (!error) {
      permissionCatalog.value = data
    }
  }

  const permissionOptions = computed(() => buildPermissionCodeOptions(permissionCatalog.value))

  const showLayout = computed(() => !model.value.parentId)

  const showPage = computed(() => model.value.menuType === "2")

  const pageOptions = computed(() => {
    const allPages = [...props.allPages]

    if (model.value.routeName && !allPages.includes(model.value.routeName)) {
      allPages.unshift(model.value.routeName)
    }

    const opts: CommonType.Option[] = allPages.map((page) => ({
      label: page,
      value: page,
    }))

    return opts
  })

  const layoutOptions: CommonType.Option[] = [
    {
      label: "base",
      value: "base",
    },
    {
      label: "blank",
      value: "blank",
    },
  ]

  function handleInitModel() {
    hydratingModel = true

    try {
      model.value = createDefaultModel()

      if (!props.rowData) return

      if (props.operateType === "addChild") {
        const { id } = props.rowData

        Object.assign(model.value, { parentId: id })
      }

      if (props.operateType === "edit") {
        const { component, ...rest } = props.rowData

        const { layout, page } = getLayoutAndPage(component)
        const { path, param } = getPathParamFromRoutePath(rest.routePath)

        Object.assign(model.value, rest, { layout, page, routePath: path, pathParam: param })
      }

      if (!model.value.query) {
        model.value.query = []
      }
    } finally {
      hydratingModel = false
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  function handleUpdateRoutePathByRouteName() {
    if (model.value.routeName) {
      model.value.routePath = getRoutePathByRouteName(model.value.routeName)
    } else {
      model.value.routePath = ""
    }
  }

  function handleUpdateI18nKeyByRouteName() {
    if (model.value.routeName) {
      model.value.i18nKey = `route.${model.value.routeName}` as I18nFullKey
    } else {
      model.value.i18nKey = null
    }
  }

  function getSubmitParams() {
    const { layout, page, pathParam, ...params } = model.value

    const component = transformLayoutAndPageToComponent(layout, page)
    const routePath = getRoutePathWithParam(model.value.routePath, pathParam)

    params.component = component
    params.routePath = routePath
    params.permission = showPermission.value ? params.permission : null

    return params
  }

  async function handleSubmit() {
    if (!operationAccess.value) return
    await validate()
    if (!operationAccess.value) return

    const params = getSubmitParams()

    if (props.operateType === "edit" && props.rowData) {
      if (!operationAccess.value) return
      const { error } = await fetchUpdateMenu(props.rowData.id, params)
      if (error) return
    } else {
      if (!operationAccess.value) return
      const { error } = await fetchCreateMenu(params as Omit<Api.SystemManage.Menu, "id" | "children">)
      if (error) return
    }

    window.$message?.success($t("common.updateSuccess"))
    closeDrawer()
    emit("submitted")
  }

  watch(visible, () => {
    if (visible.value) {
      handleInitModel()
      getPermissionCatalog()
      loadActiveMenuOptions(model.value.parentId, model.value.constant === true)
      restoreValidation()
    } else {
      loadActiveMenuOptions(null, false)
    }
  })

  watchActiveMenuPartition(model, visible, () => hydratingModel, loadActiveMenuOptions)

  watch(
    () => model.value.hideInMenu,
    (hideInMenu) => {
      if (!hideInMenu) model.value.activeMenu = null
    },
  )

  watch(
    () => model.value.routeName,
    () => {
      handleUpdateRoutePathByRouteName()
      handleUpdateI18nKeyByRouteName()
    },
  )
</script>

<template>
  <NModal v-model:show="visible" :title="title" preset="card" class="w-800px">
    <NScrollbar class="h-480px pr-20px">
      <NForm ref="formRef" :model="model" :rules="rules" label-placement="left" :label-width="100">
        <NGrid responsive="screen" item-responsive>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.menuType')" path="menuType">
            <NRadioGroup v-model:value="model.menuType" :disabled="disabledMenuType">
              <NRadio v-for="item in menuTypeOptions" :key="item.value" :value="item.value" :label="$t(item.label)" />
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.menuName')" path="menuName">
            <NInput v-model:value="model.menuName" :placeholder="$t('page.manage.menu.form.menuName')" />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.routeName')" path="routeName">
            <NInput v-model:value="model.routeName" :placeholder="$t('page.manage.menu.form.routeName')" />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.routePath')" path="routePath">
            <NInput v-model:value="model.routePath" disabled :placeholder="$t('page.manage.menu.form.routePath')" />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.pathParam')" path="pathParam">
            <NInput v-model:value="model.pathParam" :placeholder="$t('page.manage.menu.form.pathParam')" />
          </NFormItemGi>
          <NFormItemGi v-if="showLayout" span="24 m:12" :label="$t('page.manage.menu.layout')" path="layout">
            <NSelect
              v-model:value="model.layout"
              :options="layoutOptions"
              :placeholder="$t('page.manage.menu.form.layout')"
            />
          </NFormItemGi>
          <NFormItemGi v-if="showPage" span="24 m:12" :label="$t('page.manage.menu.page')" path="page">
            <NSelect
              v-model:value="model.page"
              :options="pageOptions"
              :placeholder="$t('page.manage.menu.form.page')"
            />
          </NFormItemGi>
          <NFormItemGi
            v-if="showPermission"
            span="24 m:12"
            :label="$t('page.manage.menu.permission')"
            path="permission"
          >
            <NSelect
              v-model:value="model.permission"
              :options="permissionOptions"
              filterable
              clearable
              :placeholder="$t('page.manage.menu.form.permission')"
            />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.i18nKey')" path="i18nKey">
            <NInput v-model:value="model.i18nKey" :placeholder="$t('page.manage.menu.form.i18nKey')" />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.order')" path="order">
            <NInputNumber v-model:value="model.order" class="w-full" :placeholder="$t('page.manage.menu.form.order')" />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.iconTypeTitle')" path="iconType">
            <NRadioGroup v-model:value="model.iconType">
              <NRadio
                v-for="item in menuIconTypeOptions"
                :key="item.value"
                :value="item.value"
                :label="$t(item.label)"
              />
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.icon')" path="icon">
            <template v-if="model.iconType === '1'">
              <NInput v-model:value="model.icon" :placeholder="$t('page.manage.menu.form.icon')" class="flex-1">
                <template #suffix>
                  <SvgIcon v-if="model.icon" :icon="model.icon" class="text-icon" />
                </template>
              </NInput>
            </template>
            <template v-if="model.iconType === '2'">
              <NSelect
                v-model:value="model.icon"
                :placeholder="$t('page.manage.menu.form.localIcon')"
                :options="localIconOptions"
              />
            </template>
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.menuStatus')" path="status">
            <NRadioGroup v-model:value="model.status">
              <NRadio
                v-for="item in enableStatusOptions"
                :key="item.value"
                :value="item.value"
                :label="$t(item.label)"
              />
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.keepAlive')" path="keepAlive">
            <NRadioGroup v-model:value="model.keepAlive">
              <NRadio :value="true" :label="$t('common.yesOrNo.yes')" />
              <NRadio :value="false" :label="$t('common.yesOrNo.no')" />
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.constant')" path="constant">
            <NRadioGroup v-model:value="model.constant">
              <NRadio :value="true" :label="$t('common.yesOrNo.yes')" />
              <NRadio :value="false" :label="$t('common.yesOrNo.no')" />
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.href')" path="href">
            <NInput v-model:value="model.href" :placeholder="$t('page.manage.menu.form.href')" />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.hideInMenu')" path="hideInMenu">
            <NRadioGroup v-model:value="model.hideInMenu">
              <NRadio :value="true" :label="$t('common.yesOrNo.yes')" />
              <NRadio :value="false" :label="$t('common.yesOrNo.no')" />
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi
            v-if="model.hideInMenu"
            span="24 m:12"
            :label="$t('page.manage.menu.activeMenu')"
            path="activeMenu"
          >
            <NSelect
              v-model:value="model.activeMenu"
              :options="activeMenuOptions"
              clearable
              :placeholder="$t('page.manage.menu.form.activeMenu')"
            />
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.multiTab')" path="multiTab">
            <NRadioGroup v-model:value="model.multiTab">
              <NRadio :value="true" :label="$t('common.yesOrNo.yes')" />
              <NRadio :value="false" :label="$t('common.yesOrNo.no')" />
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi span="24 m:12" :label="$t('page.manage.menu.fixedIndexInTab')" path="fixedIndexInTab">
            <NInputNumber
              v-model:value="model.fixedIndexInTab"
              class="w-full"
              clearable
              :placeholder="$t('page.manage.menu.form.fixedIndexInTab')"
            />
          </NFormItemGi>
          <NFormItemGi span="24" :label="$t('page.manage.menu.query')">
            <NDynamicInput
              v-model:value="model.query"
              preset="pair"
              :key-placeholder="$t('page.manage.menu.form.queryKey')"
              :value-placeholder="$t('page.manage.menu.form.queryValue')"
            >
              <template #action="{ index, create, remove }">
                <NSpace class="ml-12px">
                  <NButton size="medium" @click="() => create(index)">
                    <icon-ic-round-plus class="text-icon" />
                  </NButton>
                  <NButton size="medium" @click="() => remove(index)">
                    <icon-ic-round-remove class="text-icon" />
                  </NButton>
                </NSpace>
              </template>
            </NDynamicInput>
          </NFormItemGi>
        </NGrid>
      </NForm>
    </NScrollbar>
    <template #footer>
      <NSpace justify="end" :size="16">
        <NButton @click="closeDrawer">{{ $t("common.cancel") }}</NButton>
        <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped></style>
