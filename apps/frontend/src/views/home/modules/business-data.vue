<script setup lang="ts">
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardBusinessData" })

  defineProps<{
    businessSummary: Api.Dashboard.BusinessSummary
  }>()
</script>

<template>
  <NCard :bordered="false" class="card-wrapper h-full">
    <div class="flex flex-col h-full">
      <div class="flex items-center gap-8px text-15px font-600 mb-12px">
        <SvgIcon icon="carbon:dashboard" class="text-16px text-primary" />
        {{ $t("page.home.dashboard.businessData") }}
      </div>

      <div class="flex-1 flex flex-col justify-center gap-10px">
        <div
          v-for="item in [
            { label: $t('page.home.dashboard.roles'), value: businessSummary.roles, icon: 'carbon:user-role' },
            { label: $t('page.home.dashboard.menus'), value: businessSummary.menus, icon: 'carbon:menu' },
            { label: $t('page.home.dashboard.apiRouters'), value: businessSummary.routers, icon: 'carbon:api' },
            { label: $t('page.home.dashboard.schedules'), value: businessSummary.schedules, icon: 'carbon:time' },
          ]"
          :key="item.label"
          class="flex items-center justify-between px-12px py-6px rd-8px transition-colors duration-200 hover:bg-[var(--n-color-modal)]"
        >
          <div class="flex items-center gap-8px">
            <SvgIcon :icon="item.icon" class="text-15px text-[var(--text-color-3)]" />
            <span class="text-14px">{{ item.label }}</span>
          </div>
          <span class="text-16px font-600 tabular-nums">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </NCard>
</template>
