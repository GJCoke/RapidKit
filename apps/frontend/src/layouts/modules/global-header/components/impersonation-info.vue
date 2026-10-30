<script setup lang="ts">
  import { computed } from "vue"
  import { getPlatformTimezone } from "@/utils/datetime"
  import { $t } from "@/locales"
  import { useAppStore } from "@/store/modules/app"

  defineOptions({ name: "ImpersonationInfo" })
  const props = defineProps<{ snapshot: Api.Impersonation.Snapshot; seconds: number }>()
  const app = useAppStore()
  const remaining = computed(() => {
    const seconds = Math.max(0, Math.floor(props.seconds))
    return [Math.floor(seconds / 60), seconds % 60].map((value) => value.toString().padStart(2, "0")).join(":")
  })
  const expiresAt = computed(() => {
    const date = new Date(props.snapshot.expiresAt)
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(app.locale, {
          timeZone: getPlatformTimezone(),
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : "—"
  })
</script>

<template>
  <div class="w-260px max-w-[calc(100vw-48px)] px-14px py-8px">
    <div class="mb-10px flex items-center gap-6px text-12px text-base-text-2 font-600">
      <SvgIcon local-icon="incognito" class="text-16px" aria-hidden="true" />
      {{ $t("page.manage.user.impersonation.active") }}
    </div>
    <dl class="m-0 flex-col gap-8px text-12px">
      <div class="flex justify-between gap-12px">
        <dt class="text-base-text-3">{{ $t("page.manage.user.username") }}</dt>
        <dd class="m-0 min-w-0 break-all text-right text-base-text-1">@{{ snapshot.subject.username }}</dd>
      </div>
      <div class="flex justify-between gap-12px">
        <dt class="shrink-0 text-base-text-3">{{ $t("page.manage.user.impersonation.remaining") }}</dt>
        <dd class="m-0 tabular-nums text-base-text-1">{{ remaining }}</dd>
      </div>
      <div class="flex justify-between gap-12px">
        <dt class="shrink-0 text-base-text-3">{{ $t("page.manage.user.impersonation.expiresAt") }}</dt>
        <dd class="m-0 min-w-0 text-right tabular-nums text-base-text-1">{{ expiresAt }}</dd>
      </div>
    </dl>
    <p class="mb-0 mt-12px text-12px text-base-text-2 leading-18px">
      {{ $t("page.manage.user.impersonation.restoreHint") }}
    </p>
    <p class="mb-2px mt-6px text-12px text-base-text-3 leading-18px">
      {{ $t("page.manage.user.impersonation.auditHint") }}
    </p>
  </div>
</template>
