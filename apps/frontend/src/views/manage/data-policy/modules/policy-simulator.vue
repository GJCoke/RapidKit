<script setup lang="ts">
  import { ref, computed } from "vue"
  import { $t } from "@/locales"
  import { fetchSimulatePolicy, fetchGetAllDataPolicies, fetchGetUserList } from "@/service/api/system-manage"

  defineOptions({ name: "PolicySimulator" })

  const visible = defineModel<boolean>("visible", { default: false })

  const policyOptions = ref<{ label: string; value: string }[]>([])
  const userOptions = ref<{ label: string; value: string }[]>([])

  const selectedPolicies = ref<string[]>([])
  const selectedUser = ref<string | null>(null)
  const loading = ref(false)
  const result = ref<Api.DataPolicy.PolicySimulateResponse | null>(null)
  const activeTab = ref<"visible" | "excluded">("visible")

  async function loadOptions() {
    const [policiesRes, usersRes] = await Promise.all([
      fetchGetAllDataPolicies(),
      fetchGetUserList({ page: 1, pageSize: 100 }),
    ])
    if (policiesRes.data) {
      policyOptions.value = policiesRes.data.map((p) => ({ label: p.name, value: p.id }))
    }
    if (usersRes.data) {
      userOptions.value = usersRes.data.records.map((u: any) => ({ label: u.name, value: u.id }))
    }
  }

  async function handleSimulate() {
    if (!selectedPolicies.value.length || !selectedUser.value) return
    loading.value = true
    try {
      const { data } = await fetchSimulatePolicy({
        policyIds: selectedPolicies.value,
        targetUserId: selectedUser.value,
      })
      if (data) {
        result.value = data
      }
    } finally {
      loading.value = false
    }
  }

  function handleOpen() {
    result.value = null
    selectedPolicies.value = []
    selectedUser.value = null
    loadOptions()
  }

  const previewColumns = computed(() => {
    if (!result.value?.previewRows.length) return []
    const keys = Object.keys(result.value.previewRows[0])
    return keys.slice(0, 6).map((key) => ({
      key,
      title: key,
      ellipsis: { tooltip: true },
    }))
  })

  const filterRate = computed(() => {
    if (!result.value || !result.value.totalCount) return 0
    return Math.round((result.value.filteredCount / result.value.totalCount) * 100)
  })
</script>

<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :title="$t('page.manage.dataPolicy.simulator.title')"
    class="w-860px"
    :segmented="{ content: true }"
    @after-enter="handleOpen"
  >
    <!-- Input Section -->
    <NCard size="small" class="mb-16px">
      <div class="flex items-end gap-14px">
        <div class="flex-1">
          <div class="text-12px font-500 text-[var(--text-color-3)] mb-6px uppercase tracking-wide">
            {{ $t("page.manage.dataPolicy.simulator.selectPolicies") }}
          </div>
          <NSelect
            v-model:value="selectedPolicies"
            :options="policyOptions"
            multiple
            filterable
            size="small"
            :max-tag-count="2"
          />
        </div>
        <div class="w-200px">
          <div class="text-12px font-500 text-[var(--text-color-3)] mb-6px uppercase tracking-wide">
            {{ $t("page.manage.dataPolicy.simulator.selectUser") }}
          </div>
          <NSelect v-model:value="selectedUser" :options="userOptions" filterable size="small" />
        </div>
        <NButton
          type="primary"
          size="small"
          :loading="loading"
          :disabled="!selectedPolicies.length || !selectedUser"
          @click="handleSimulate"
        >
          <template #icon>
            <icon-mdi-play class="text-14px" />
          </template>
          {{ $t("page.manage.dataPolicy.simulator.run") }}
        </NButton>
      </div>
    </NCard>

    <!-- Results Section -->
    <template v-if="result">
      <NAlert v-if="result.isAdminBypass" type="warning" class="mb-16px">
        {{ $t("page.manage.dataPolicy.simulator.adminBypass") }}
      </NAlert>

      <!-- Stats Cards -->
      <div class="grid grid-cols-3 gap-12px mb-16px">
        <NCard size="small" hoverable>
          <div class="flex items-center gap-12px">
            <div class="flex-center w-36px h-36px rd-8px bg-[var(--body-color)]">
              <icon-mdi-database-outline class="text-18px op-60" />
            </div>
            <div class="flex-col gap-2px">
              <span class="text-11px text-[var(--text-color-3)] tracking-wide">
                {{ $t("page.manage.dataPolicy.simulator.totalCount") }}
              </span>
              <span class="text-22px font-700 tabular-nums lh-tight">{{ result.totalCount }}</span>
            </div>
          </div>
        </NCard>

        <NCard size="small" hoverable class="relative">
          <div class="flex items-center gap-12px">
            <div class="flex-center w-36px h-36px rd-8px bg-[rgba(24,160,88,0.08)]">
              <icon-mdi-eye-outline class="text-18px text-[var(--success-color)]" />
            </div>
            <div class="flex-col gap-2px">
              <span class="text-11px text-[var(--text-color-3)] tracking-wide">
                {{ $t("page.manage.dataPolicy.simulator.visibleCount") }}
              </span>
              <span class="text-22px font-700 tabular-nums lh-tight text-[var(--success-color)]">
                {{ result.filteredCount }}
              </span>
            </div>
          </div>
          <NTag size="tiny" :bordered="false" round type="success" class="absolute top-8px right-10px">
            {{ filterRate }}%
          </NTag>
        </NCard>

        <NCard size="small" hoverable>
          <div class="flex items-center gap-12px">
            <div class="flex-center w-36px h-36px rd-8px bg-[rgba(208,48,80,0.08)]">
              <icon-mdi-eye-off-outline class="text-18px text-[var(--error-color)]" />
            </div>
            <div class="flex-col gap-2px">
              <span class="text-11px text-[var(--text-color-3)] tracking-wide">
                {{ $t("page.manage.dataPolicy.simulator.excludedCount") }}
              </span>
              <span class="text-22px font-700 tabular-nums lh-tight text-[var(--error-color)]">
                {{ result.excludedCount }}
              </span>
            </div>
          </div>
        </NCard>
      </div>

      <!-- Policy Details -->
      <NCollapse :default-expanded-names="['policies']" class="mb-16px">
        <NCollapseItem :title="$t('page.manage.dataPolicy.simulator.policyDetails')" name="policies">
          <div class="flex-col gap-6px">
            <div
              v-for="p in result.policiesApplied"
              :key="p.policyId"
              class="flex items-center justify-between px-12px py-8px rd-8px bg-[var(--body-color)] border border-transparent hover:border-[var(--border-color)] transition-colors"
            >
              <div class="flex items-center gap-8px">
                <div class="w-6px h-6px rd-full bg-[var(--primary-color)] shrink-0" />
                <span class="text-13px font-500">{{ p.policyName }}</span>
              </div>
              <div class="flex items-center gap-10px">
                <NTag size="small" :bordered="false" type="success" round>
                  {{ p.matchedCount }} {{ $t("page.manage.dataPolicy.simulator.matched") }}
                </NTag>
                <NTooltip :style="{ maxWidth: '520px' }">
                  <template #trigger>
                    <NCode :code="p.sqlFragment" language="sql" class="max-w-240px truncate text-11px cursor-help" />
                  </template>
                  <NCode :code="p.sqlFragment" language="sql" word-wrap class="text-11px" />
                </NTooltip>
              </div>
            </div>
          </div>
        </NCollapseItem>
      </NCollapse>

      <!-- Data Preview Tabs -->
      <NTabs v-model:value="activeTab" type="segment" size="small" animated class="mb-16px">
        <NTabPane name="visible" :tab="$t('page.manage.dataPolicy.simulator.visibleData')">
          <NDataTable
            :columns="previewColumns"
            :data="result.previewRows"
            size="small"
            :max-height="220"
            striped
            class="mt-8px rd-8px overflow-hidden"
            :bordered="true"
          />
        </NTabPane>
        <NTabPane name="excluded" :tab="$t('page.manage.dataPolicy.simulator.excludedData')">
          <NDataTable
            :columns="previewColumns"
            :data="result.excludedRows"
            size="small"
            :max-height="220"
            striped
            class="mt-8px rd-8px overflow-hidden"
            :bordered="true"
          />
        </NTabPane>
      </NTabs>

      <!-- Generated SQL -->
      <NCollapse>
        <NCollapseItem :title="$t('page.manage.dataPolicy.simulator.generatedSql')" name="sql">
          <NCode :code="result.generatedSql" language="sql" word-wrap />
        </NCollapseItem>
      </NCollapse>
    </template>

    <!-- Empty State -->
    <NEmpty v-else class="py-48px" :description="$t('page.manage.dataPolicy.simulator.run')">
      <template #icon>
        <icon-mdi-flask-outline class="text-36px op-40" />
      </template>
    </NEmpty>
  </NModal>
</template>
