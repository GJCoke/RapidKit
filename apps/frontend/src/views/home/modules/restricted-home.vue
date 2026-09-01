<script setup lang="ts">
  import { computed, onMounted, ref } from "vue"
  import { useClipboard } from "@vueuse/core"
  import { $t } from "@/locales"
  import { fetchGetAdminContacts } from "@/service/api"
  import { visibleAdminContacts } from "../visible-admin-contacts"

  defineOptions({ name: "RestrictedHome" })

  const contacts = ref<Api.SystemManage.AdminContacts>([])
  const expanded = ref(false)
  const loading = ref(true)
  const failed = ref(false)
  const visibleContacts = computed(() => visibleAdminContacts(contacts.value, expanded.value))
  const { copy } = useClipboard()

  async function copyEmail(name: string, email: string) {
    await copy(email)
    window.$message?.success($t("page.home.dashboard.permission.copySuccess", { name }))
  }

  onMounted(async () => {
    const { data, error } = await fetchGetAdminContacts()
    failed.value = Boolean(error) || !data?.length
    contacts.value = data ?? []
    loading.value = false
  })
</script>

<template>
  <div class="min-h-520px flex-center px-16px py-32px">
    <NCard :bordered="false" class="card-wrapper max-w-680px w-full">
      <div class="flex-col-center py-24px text-center">
        <div class="size-64px flex-center rounded-18px bg-primary-50 text-32px text-primary dark:bg-primary-900/30">
          <SvgIcon icon="carbon:locked" />
        </div>
        <h2 class="mb-8px mt-20px text-24px text-[var(--text-color-1)]">
          {{ $t("page.home.dashboard.permission.title") }}
        </h2>
        <p class="m-0 max-w-500px text-14px leading-24px text-[var(--text-color-3)]">
          {{ $t("page.home.dashboard.permission.description") }}
        </p>
      </div>

      <NSpin :show="loading">
        <div
          v-if="!failed"
          class="mx-auto max-w-560px overflow-hidden rounded-12px border border-[var(--border-color)]"
        >
          <div
            v-for="contact in visibleContacts"
            :key="contact.id"
            class="flex flex-wrap items-center gap-12px border-b border-[var(--border-color)] px-16px py-14px last:border-b-0"
          >
            <NAvatar round :size="40" :src="contact.avatar || undefined">{{ contact.name.slice(0, 1) }}</NAvatar>
            <div class="min-w-0 flex-1 text-left">
              <div class="font-500 text-[var(--text-color-1)]">{{ contact.name }}</div>
              <div class="break-all text-13px text-[var(--text-color-3)]">{{ contact.email }}</div>
            </div>
            <NButton
              quaternary
              type="primary"
              :aria-label="$t('page.home.dashboard.permission.copyEmailFor', { name: contact.name })"
              @click="copyEmail(contact.name, contact.email)"
            >
              {{ $t("page.home.dashboard.permission.copyEmail") }}
            </NButton>
          </div>
        </div>
        <NEmpty
          v-else-if="!loading"
          :description="$t('page.home.dashboard.permission.contactsUnavailable')"
          class="py-24px"
        />
      </NSpin>

      <div v-if="contacts.length > 3" class="mt-16px text-center">
        <NButton text type="primary" @click="expanded = !expanded">
          {{
            expanded
              ? $t("page.home.dashboard.permission.collapse")
              : $t("page.home.dashboard.permission.viewAll", { count: contacts.length })
          }}
        </NButton>
      </div>
    </NCard>
  </div>
</template>
