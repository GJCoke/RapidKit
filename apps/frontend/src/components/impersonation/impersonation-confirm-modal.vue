<script setup lang="ts">
  import { ref, watch } from "vue"
  import { useRoute } from "vue-router"
  import { $t } from "@/locales"
  import { useAuthStore } from "@/store/modules/auth"

  defineOptions({ name: "ImpersonationConfirmModal" })
  const props = defineProps<{ user: Api.SystemManage.User; departmentName?: string }>()
  const show = defineModel<boolean>("show", { default: false })
  const reason = ref("")
  const loading = ref(false)
  const route = useRoute()
  const auth = useAuthStore()
  watch(show, (value) => {
    if (value) reason.value = ""
  })

  async function submit() {
    if (loading.value) return
    loading.value = true
    try {
      const started = await auth.startImpersonation(
        { targetUserId: props.user.id, reason: reason.value.trim() || null },
        route.fullPath,
      )
      if (started) show.value = false
    } finally {
      loading.value = false
    }
  }
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    class="w-480px max-w-92vw"
    :title="$t('page.manage.user.impersonation.confirmTitle')"
    :mask-closable="!loading"
    :close-on-esc="!loading"
    :closable="!loading"
  >
    <div class="flex-col-stretch gap-16px">
      <NAlert type="warning">{{ $t("page.manage.user.impersonation.warning") }}</NAlert>
      <NDescriptions :column="1" label-placement="left">
        <NDescriptionsItem :label="$t('page.manage.user.name')"
          >{{ user.name }} ({{ user.username }})</NDescriptionsItem
        >
        <NDescriptionsItem :label="$t('page.manage.user.userRole')">{{
          user.roles.join(", ") || "-"
        }}</NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.manage.department.column')">{{ departmentName || "-" }}</NDescriptionsItem>
      </NDescriptions>
      <NInput
        v-model:value="reason"
        type="textarea"
        :maxlength="500"
        show-count
        :placeholder="$t('page.manage.user.impersonation.reason')"
        :disabled="loading"
      />
      <div class="flex justify-end gap-8px">
        <NButton :disabled="loading" @click="show = false">{{ $t("common.cancel") }}</NButton>
        <NButton type="warning" :loading="loading" @click="submit">{{
          $t("page.manage.user.impersonation.start")
        }}</NButton>
      </div>
    </div>
  </NModal>
</template>
