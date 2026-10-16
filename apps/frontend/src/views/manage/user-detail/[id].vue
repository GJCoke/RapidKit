<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { $t } from "@/locales"
  import { userStatusRecord } from "@/constants/business"
  import { fetchGetUserDetail, fetchGetDepartmentTree } from "@/service/api"
  import ImpersonationButton from "@/components/impersonation/impersonation-button.vue"
  import { createDepartmentMap } from "../user/composables/department-map"

  defineOptions({ name: "ManageUserDetail" })
  const props = defineProps<{ id: string }>()
  const loading = ref(false)
  const user = ref<Api.SystemManage.UserDetail | null>(null)
  const departmentMap = ref<Record<string, string>>({})
  const departmentName = computed(() =>
    user.value?.departmentId ? departmentMap.value[user.value.departmentId] || user.value.departmentId : undefined,
  )
  let loadVersion = 0

  watch(
    () => props.id,
    async (id) => {
      const version = ++loadVersion
      user.value = null
      departmentMap.value = {}
      loading.value = true
      try {
        const [detail, departments] = await Promise.all([fetchGetUserDetail(id), fetchGetDepartmentTree()])
        if (version !== loadVersion) return
        if (!detail.error) user.value = detail.data
        if (!departments.error) departmentMap.value = createDepartmentMap(departments.data)
      } finally {
        if (version === loadVersion) loading.value = false
      }
    },
    { immediate: true },
  )
</script>

<template>
  <NCard :title="$t('page.manage.user.detailTitle')" :bordered="false" class="card-wrapper">
    <NSpin :show="loading">
      <div v-if="user" class="flex-col-stretch gap-20px">
        <div class="flex flex-wrap items-center justify-between gap-12px">
          <div>
            <div class="text-20px font-600 text-base-text-1">{{ user.name }}</div>
            <div class="text-base-text-3">{{ user.username }}</div>
          </div>
          <ImpersonationButton :user="user" :department-name="departmentName" />
        </div>
        <NDescriptions :column="1" label-placement="left" bordered>
          <NDescriptionsItem :label="$t('page.manage.user.userStatus')">{{
            $t(userStatusRecord[user.status])
          }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.manage.user.userRole')">
            <div class="flex flex-wrap gap-6px">
              <NTag v-for="role in user.roles" :key="role" size="small">{{ role }}</NTag
              ><span v-if="!user.roles.length">-</span>
            </div>
          </NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.manage.department.column')">{{
            departmentName || "-"
          }}</NDescriptionsItem>
        </NDescriptions>
      </div>
      <NEmpty v-else-if="!loading" :description="$t('page.manage.user.detailEmpty')" />
    </NSpin>
  </NCard>
</template>
