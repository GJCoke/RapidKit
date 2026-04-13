<script setup lang="ts">
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardInfraStatus" })

  defineProps<{
    infrastructure: Api.Dashboard.InfrastructureHealth
  }>()

  const theme = useThemeVars()

  function statusColor(status: string) {
    if (status === "healthy") return theme.value.successColor
    if (status === "degraded") return theme.value.warningColor
    return theme.value.errorColor
  }

  function statusLabel(status: string) {
    if (status === "healthy") return $t("page.home.dashboard.healthy")
    if (status === "degraded") return $t("page.home.dashboard.degraded")
    return $t("page.home.dashboard.down")
  }

  function statusTagType(status: string): "success" | "warning" | "error" {
    if (status === "healthy") return "success"
    if (status === "degraded") return "warning"
    return "error"
  }
</script>

<template>
  <NCard :bordered="false" class="card-wrapper h-full">
    <div class="flex flex-col h-full">
      <div class="flex items-center gap-8px text-15px font-600 mb-12px">
        <SvgIcon icon="carbon:cloud-monitoring" class="text-16px text-primary" />
        {{ $t("page.home.dashboard.infrastructure") }}
      </div>

      <div class="flex-1 flex flex-col justify-center gap-8px">
        <div
          v-for="(service, key) in {
            PostgreSQL: infrastructure.pg,
            Redis: infrastructure.redis,
            MinIO: infrastructure.minio,
          }"
          :key="key"
          class="flex items-center justify-between px-12px py-8px rd-8px transition-colors duration-200 hover:bg-[var(--n-color-modal)]"
        >
          <div class="flex items-center gap-8px min-w-0">
            <span
              class="inline-block w-8px h-8px min-w-8px rd-full"
              :class="{ 'status-dot-pulse': service.status === 'healthy' }"
              :style="{ backgroundColor: statusColor(service.status), '--dot-color': statusColor(service.status) }"
            />
            <span class="font-500 text-14px">{{ key }}</span>
          </div>
          <div class="flex items-center gap-8px">
            <span v-if="service.latencyMs" class="text-12px text-[var(--text-color-3)] tabular-nums">
              {{ service.latencyMs }}ms
            </span>
            <NTag :type="statusTagType(service.status)" size="small" round>
              {{ statusLabel(service.status) }}
            </NTag>
          </div>
        </div>
      </div>
    </div>
  </NCard>
</template>

<style scoped>
  .status-dot-pulse {
    animation: pulse-ring 2s ease-in-out infinite;
    box-shadow: 0 0 0 0 var(--dot-color);
  }

  @keyframes pulse-ring {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--dot-color) 50%, transparent);
    }
    70% {
      box-shadow: 0 0 0 6px transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }
</style>
