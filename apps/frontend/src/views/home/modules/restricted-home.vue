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

  const permissionSteps = computed(() => [
    {
      icon: "carbon:user-admin",
      title: $t("page.home.dashboard.permission.steps.contactAdmin.title"),
      description: $t("page.home.dashboard.permission.steps.contactAdmin.description"),
    },
    {
      icon: "carbon:dashboard-reference",
      title: $t("page.home.dashboard.permission.steps.configure.title"),
      description: $t("page.home.dashboard.permission.steps.configure.description"),
    },
    {
      icon: "carbon:renew",
      title: $t("page.home.dashboard.permission.steps.refresh.title"),
      description: $t("page.home.dashboard.permission.steps.refresh.description"),
    },
  ])

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
  <div class="mx-auto min-h-520px max-w-1080px w-full px-16px py-36px sm:px-24px lg:py-52px">
    <div class="flex-col-center text-center">
      <div class="size-72px flex-center rounded-20px bg-primary-50 text-34px text-primary dark:bg-primary-950">
        <SvgIcon icon="carbon:security" />
      </div>
      <h2 class="mb-8px mt-20px text-26px font-600 text-base-text-1">
        {{ $t("page.home.dashboard.permission.title") }}
      </h2>
      <p class="m-0 max-w-560px text-14px leading-24px text-base-text-3">
        {{ $t("page.home.dashboard.permission.description") }}
      </p>
    </div>

    <NCard :bordered="false" class="card-wrapper mt-32px">
      <div class="grid grid-cols-1 gap-24px md:grid-cols-3 md:gap-16px">
        <div
          v-for="(step, index) in permissionSteps"
          :key="step.title"
          class="relative flex items-start gap-14px px-4px py-6px"
        >
          <div
            class="size-46px flex-center shrink-0 rounded-14px bg-primary-50 text-21px text-primary dark:bg-primary-950"
          >
            <SvgIcon :icon="step.icon" />
          </div>
          <div class="min-w-0 text-left">
            <div class="flex items-center gap-8px">
              <span class="size-20px flex-center rounded-full bg-primary text-11px text-white">
                {{ index + 1 }}
              </span>
              <span class="text-15px font-600 text-base-text-1">{{ step.title }}</span>
            </div>
            <p class="mb-0 mt-8px text-13px leading-20px text-base-text-3">{{ step.description }}</p>
          </div>
          <SvgIcon
            v-if="index < permissionSteps.length - 1"
            icon="carbon:chevron-right"
            class="absolute right--10px top-20px hidden text-18px text-base-text-3 md:block"
          />
        </div>
      </div>
    </NCard>

    <section class="mt-28px">
      <div class="mb-12px flex flex-wrap items-end justify-between gap-8px">
        <div>
          <h3 class="m-0 text-16px font-600 text-base-text-1">
            {{ $t("page.home.dashboard.permission.contactTitle") }}
          </h3>
          <p class="mb-0 mt-4px text-13px text-base-text-3">
            {{ $t("page.home.dashboard.permission.contactDescription") }}
          </p>
        </div>
      </div>

      <NSpin :show="loading">
        <NCard v-if="!failed" :bordered="false" class="card-wrapper overflow-hidden" content-style="padding: 0">
          <div
            v-for="contact in visibleContacts"
            :key="contact.id"
            class="flex flex-wrap items-center gap-14px border-b border-theme-default px-16px py-15px transition-colors last:border-b-0 sm:px-20px hover:bg-theme-modal"
          >
            <AppAvatar :src="contact.avatar" :name="contact.name" :seed="contact.id" :size="42" />
            <div class="min-w-150px flex-1 text-left">
              <div class="font-600 text-base-text-1">{{ contact.name }}</div>
              <div class="mt-2px break-all text-13px text-base-text-3">{{ contact.email }}</div>
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
        </NCard>
        <NCard v-else-if="!loading" :bordered="false" class="card-wrapper">
          <NEmpty :description="$t('page.home.dashboard.permission.contactsUnavailable')" class="py-20px" />
        </NCard>
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
    </section>
  </div>
</template>
