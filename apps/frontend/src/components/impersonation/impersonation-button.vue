<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { $t } from "@/locales"
  import { useAuthStore } from "@/store/modules/auth"
  import { canImpersonate } from "./eligibility"
  import ImpersonationConfirmModal from "./impersonation-confirm-modal.vue"

  defineOptions({ name: "ImpersonationButton" })
  const props = defineProps<{ user: Api.SystemManage.User; departmentName?: string }>()
  const auth = useAuthStore()
  const visible = ref(false)
  const allowed = computed(() => canImpersonate(auth.userInfo, props.user, Boolean(auth.impersonation)))
  watch(allowed, (value) => {
    if (!value) visible.value = false
  })
</script>

<template>
  <template v-if="allowed">
    <NButton size="small" type="warning" ghost @click="visible = true">
      {{ $t("page.manage.user.impersonation.start") }}
    </NButton>
    <ImpersonationConfirmModal v-model:show="visible" :user="user" :department-name="departmentName" />
  </template>
</template>
