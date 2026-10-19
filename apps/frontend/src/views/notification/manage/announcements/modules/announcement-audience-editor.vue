<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useAuth } from "@/hooks/business/auth"
  import { fetchGetAllRoles, fetchGetAllUsers, fetchGetDepartmentTree } from "@/service/api"
  import { $t } from "@/locales"

  defineOptions({ name: "AnnouncementAudienceEditor" })
  const rules = defineModel<Api.Notification.AudienceRule[]>({ required: true })
  const props = defineProps<{ disabled?: boolean }>()
  const { hasAuth } = useAuth()
  const t = (key: string, params: Record<string, unknown> = {}) =>
    $t(`page.notification.manage.announcements.editor.${key}` as I18nFullKey, params)
  type AudienceType = "role" | "department" | "user"
  const permissions = {
    role: "role:options",
    department: "department:read",
    user: "user:options",
  } satisfies Record<AudienceType, PermissionCode>
  const options = ref<Record<AudienceType, { label: string; value: string }[]>>({ role: [], department: [], user: [] })
  const status = ref<Record<AudienceType, "idle" | "loading" | "loaded" | "error">>({
    role: "idle",
    department: "idle",
    user: "idle",
  })
  const types = computed(() =>
    (["department", "role", "user"] as const).map((value) => ({ label: t(`audienceTypes.${value}`), value })),
  )
  function flattenDepartments(
    rows: Api.SystemManage.DepartmentTree[],
    parent = "",
  ): { label: string; value: string }[] {
    return rows.flatMap((row) => {
      const label = parent ? `${parent} / ${row.name}` : row.name
      return [{ label, value: row.id }, ...flattenDepartments(row.children ?? [], label)]
    })
  }
  async function load(type: AudienceType) {
    if (!hasAuth(permissions[type]) || status.value[type] === "loading" || status.value[type] === "loaded") return
    status.value[type] = "loading"
    if (type === "role") {
      const { data, error } = await fetchGetAllRoles()
      if (!error && data)
        options.value.role = data.map((row) => ({ label: `${row.name} · ${row.code}`, value: row.code }))
      status.value.role = error || !data ? "error" : "loaded"
    } else if (type === "department") {
      const { data, error } = await fetchGetDepartmentTree()
      if (!error && data) options.value.department = flattenDepartments(data)
      status.value.department = error || !data ? "error" : "loaded"
    } else {
      const { data, error } = await fetchGetAllUsers()
      if (!error && data)
        options.value.user = data.map((row) => ({ label: `${row.name} · ${row.username}`, value: row.id }))
      status.value.user = error || !data ? "error" : "loaded"
    }
  }
  function changeType(index: number, type: AudienceType) {
    rules.value[index] = { type, value: null, includeDescendants: false }
  }
  watch(
    () => rules.value.map((rule) => rule.type),
    (values) => {
      for (const type of new Set(values)) if (type !== "all") void load(type)
    },
    { immediate: true },
  )
</script>

<template>
  <div class="flex-col gap-10px">
    <div
      v-for="(rule, index) in rules"
      :key="index"
      class="grid grid-cols-[112px_minmax(0,1fr)_32px] items-start gap-8px"
    >
      <NSelect
        :value="rule.type"
        :options="types"
        :disabled="disabled"
        :aria-label="t('audienceTypeLabel', { index: index + 1 })"
        @update:value="changeType(index, $event)"
      />
      <div class="min-w-0">
        <NSelect
          v-if="rule.type !== 'all' && hasAuth(permissions[rule.type]) && status[rule.type] !== 'error'"
          v-model:value="rule.value"
          filterable
          clearable
          :loading="status[rule.type] === 'loading'"
          :options="options[rule.type]"
          :disabled="disabled"
          :placeholder="t(`audiencePlaceholders.${rule.type}`)"
          :aria-label="t('audienceValueLabel', { index: index + 1 })"
        />
        <template v-else>
          <NInput
            v-model:value="rule.value"
            :disabled="disabled"
            :placeholder="t(`audienceIds.${rule.type}`)"
            :input-props="{ 'aria-label': t('audienceValueLabel', { index: index + 1 }) }"
          />
          <p class="mb-0 mt-4px text-12px leading-18px text-warning">
            {{ t(status[rule.type as AudienceType] === "error" ? "directoryFailed" : "directoryForbidden") }}
            <NButton
              v-if="rule.type !== 'all' && status[rule.type] === 'error'"
              text
              type="primary"
              :disabled="disabled"
              @click="load(rule.type)"
              >{{ t("retry") }}</NButton
            >
          </p>
        </template>
        <NCheckbox
          v-if="rule.type === 'department'"
          v-model:checked="rule.includeDescendants"
          :disabled="disabled"
          class="mt-8px whitespace-nowrap"
          >{{ t("includeDescendants") }}</NCheckbox
        >
      </div>
      <NButton
        quaternary
        circle
        type="error"
        class="h-32px w-32px"
        :disabled="disabled || rules.length === 1"
        :aria-label="t('removeAudience', { index: index + 1 })"
        @click="rules.splice(index, 1)"
      >
        <template #icon><SvgIcon icon="carbon:trash-can" class="text-18px" /></template>
      </NButton>
    </div>
    <NButton dashed block :disabled="disabled" @click="rules.push({ type: 'user', value: null })"
      ><SvgIcon icon="carbon:add" class="mr-6px" />{{ t("addAudience") }}</NButton
    >
    <p class="m-0 text-12px leading-18px text-base-text-3">{{ t("audienceUnion") }}</p>
  </div>
</template>
