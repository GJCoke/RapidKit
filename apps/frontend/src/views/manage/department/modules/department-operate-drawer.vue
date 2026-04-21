<script setup lang="ts">
  import { computed, ref, shallowRef, watch } from "vue"
  import type { TreeSelectOption } from "naive-ui"
  import { jsonClone } from "@rapidkit/utils"
  import { enableStatusOptions } from "@/constants/business"
  import { fetchCreateDepartment, fetchGetAllUsers, fetchGetDepartmentTree, fetchUpdateDepartment } from "@/service/api"
  import { useFormRules, useNaiveForm } from "@/hooks/common/form"
  import { $t } from "@/locales"

  defineOptions({ name: "DepartmentOperateDrawer" })

  interface Props {
    operateType: "add" | "addChild" | "edit"
    rowData?: Api.SystemManage.DepartmentTree | null
    parentData?: Api.SystemManage.DepartmentTree | null
  }

  const props = defineProps<Props>()

  interface Emits {
    (e: "submitted"): void
  }

  const emit = defineEmits<Emits>()

  const visible = defineModel<boolean>("visible", { default: false })

  const { formRef, validate, restoreValidation } = useNaiveForm()
  const { defaultRequiredRule } = useFormRules()

  const title = computed(() => {
    if (props.operateType === "edit") return $t("page.manage.department.editDepartment")
    return $t("page.manage.department.addDepartment")
  })

  type Model = {
    parentId: string | null
    name: string
    code: string
    sort: number
    status: Api.Common.EnableStatus | null
    leaderId: string | null
  }

  const model = ref(createDefaultModel())

  function createDefaultModel(): Model {
    return {
      parentId: null,
      name: "",
      code: "",
      sort: 0,
      status: "1",
      leaderId: null,
    }
  }

  const rules: Record<"name" | "code" | "status", App.Global.FormRule> = {
    name: defaultRequiredRule,
    code: defaultRequiredRule,
    status: defaultRequiredRule,
  }

  const deptTreeOptions = shallowRef<TreeSelectOption[]>([])

  function buildDeptTreeSelect(departments: Api.SystemManage.DepartmentTree[]): TreeSelectOption[] {
    return departments.map((dept) => ({
      key: dept.id,
      label: dept.name,
      children: dept.children?.length ? buildDeptTreeSelect(dept.children) : undefined,
    }))
  }

  async function loadDeptTree() {
    const { data, error } = await fetchGetDepartmentTree()
    if (error) return
    deptTreeOptions.value = buildDeptTreeSelect(data)
  }

  const leaderOptions = ref<Array<{ label: string; value: string }>>([])

  async function loadLeaderOptions() {
    const { data, error } = await fetchGetAllUsers()
    if (error) return
    leaderOptions.value = data.map((u: Api.SystemManage.UserOption) => ({
      label: `${u.name} (${u.username})`,
      value: u.id,
    }))
  }

  function handleInitModel() {
    model.value = createDefaultModel()

    if (props.operateType === "edit" && props.rowData) {
      const { parentId, name, code, sort, status, leaderId } = jsonClone(props.rowData)
      Object.assign(model.value, { parentId, name, code, sort, status, leaderId })
    }

    if (props.operateType === "addChild" && props.parentData) {
      model.value.parentId = props.parentData.id
    }
  }

  function closeDrawer() {
    visible.value = false
  }

  async function handleSubmit() {
    await validate()

    const payload = {
      parentId: model.value.parentId,
      name: model.value.name,
      code: model.value.code,
      sort: model.value.sort,
      status: model.value.status ?? undefined,
      leaderId: model.value.leaderId,
    }

    if (props.operateType === "edit" && props.rowData) {
      const { error } = await fetchUpdateDepartment(props.rowData.id, payload)
      if (error) return
    } else {
      const { error } = await fetchCreateDepartment(payload)
      if (error) return
    }

    window.$message?.success($t("common.updateSuccess"))
    closeDrawer()
    emit("submitted")
  }

  watch(visible, () => {
    if (visible.value) {
      handleInitModel()
      restoreValidation()
      loadDeptTree()
      loadLeaderOptions()
    }
  })
</script>

<template>
  <NDrawer v-model:show="visible" display-directive="show" :width="360">
    <NDrawerContent :title="title" :native-scrollbar="false" closable>
      <NForm ref="formRef" :model="model" :rules="rules">
        <NFormItem :label="$t('page.manage.department.parentDepartment')" path="parentId">
          <NTreeSelect
            v-model:value="model.parentId"
            :options="deptTreeOptions"
            :placeholder="$t('page.manage.department.form.parentDepartment')"
            clearable
            default-expand-all
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.department.name')" path="name">
          <NInput v-model:value="model.name" :placeholder="$t('page.manage.department.form.name')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.department.code')" path="code">
          <NInput v-model:value="model.code" :placeholder="$t('page.manage.department.form.code')" />
        </NFormItem>
        <NFormItem :label="$t('page.manage.department.sort')" path="sort">
          <NInputNumber
            v-model:value="model.sort"
            :placeholder="$t('page.manage.department.form.sort')"
            class="w-full"
          />
        </NFormItem>
        <NFormItem :label="$t('page.manage.department.status')" path="status">
          <NRadioGroup v-model:value="model.status">
            <NRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value" :label="$t(item.label)" />
          </NRadioGroup>
        </NFormItem>
        <NFormItem :label="$t('page.manage.department.leader')" path="leaderId">
          <NSelect
            v-model:value="model.leaderId"
            :options="leaderOptions"
            :placeholder="$t('page.manage.department.form.leader')"
            clearable
            filterable
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace :size="16">
          <NButton @click="closeDrawer">{{ $t("common.cancel") }}</NButton>
          <NButton type="primary" @click="handleSubmit">{{ $t("common.confirm") }}</NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped></style>
