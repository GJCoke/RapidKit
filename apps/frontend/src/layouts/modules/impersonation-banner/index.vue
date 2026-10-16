<script setup lang="ts">
  import { computed, ref } from "vue"
  import { $t } from "@/locales"
  import { useAuthStore } from "@/store/modules/auth"

  defineOptions({ name: "ImpersonationBanner" })
  const auth = useAuthStore()
  const stopping = ref(false)
  const remaining = computed(() => {
    const seconds = auth.expiresInSeconds
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
  })
  async function stop() {
    if (stopping.value) return
    stopping.value = true
    try {
      await auth.stopImpersonation()
    } finally {
      stopping.value = false
    }
  }
</script>

<template>
  <NAlert v-if="auth.impersonation" type="warning" :bordered="false" class="rd-0" role="status">
    <div class="flex flex-wrap items-center justify-between gap-8px">
      <span class="min-w-0 break-all">
        {{
          $t("page.manage.user.impersonation.viewing", {
            name: auth.impersonation.subject.name,
            username: auth.impersonation.subject.username,
          })
        }}
        · {{ $t("page.manage.user.impersonation.remaining") }} <span class="tabular-nums">{{ remaining }}</span>
      </span>
      <NButton size="small" :loading="stopping" @click="stop">{{ $t("page.manage.user.impersonation.stop") }}</NButton>
    </div>
  </NAlert>
</template>
