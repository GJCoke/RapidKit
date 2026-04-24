<script setup lang="ts">
  import { toRaw } from "vue"
  import { jsonClone } from "@rapidkit/utils"
  import { $t } from "@/locales"

  defineOptions({
    name: "ScheduleSearch",
  })

  interface Emits {
    (e: "search"): void
  }

  const emit = defineEmits<Emits>()

  const model = defineModel<Api.Worker.PeriodicTaskSearchParams>("model", { required: true })

  const defaultModel = jsonClone(toRaw(model.value))

  function resetModel() {
    Object.assign(model.value, defaultModel)
  }

  function search() {
    emit("search")
  }

  const enabledOptions: { label: string; value: number }[] = [
    { label: $t("page.manage.common.status.enable"), value: 1 },
    { label: $t("page.manage.common.status.disable"), value: 0 },
  ]
</script>

<template>
  <NCard :bordered="false" size="small" class="card-wrapper">
    <NCollapse :default-expanded-names="['schedule-search']">
      <NCollapseItem :title="$t('common.search')" name="schedule-search">
        <NForm :model="model" label-placement="left" :label-width="100">
          <NGrid responsive="screen" item-responsive>
            <NFormItemGi
              span="24 s:12 m:8"
              :label="$t('page.manage.worker.schedule.task')"
              path="taskName"
              class="pr-24px"
            >
              <NInput v-model:value="model.taskName" :placeholder="$t('page.manage.worker.schedule.form.task')" />
            </NFormItemGi>
            <NFormItemGi
              span="24 s:12 m:8"
              :label="$t('page.manage.worker.schedule.enabled')"
              path="enabled"
              class="pr-24px"
            >
              <NSelect
                :value="model.enabled == null ? null : model.enabled ? 1 : 0"
                :placeholder="$t('page.manage.worker.schedule.enabled')"
                :options="enabledOptions"
                clearable
                @update:value="(v: number | null) => (model.enabled = v == null ? undefined : Boolean(v))"
              />
            </NFormItemGi>
            <NFormItemGi span="24 s:12 m:8">
              <NSpace class="w-full" justify="end">
                <NButton @click="resetModel">
                  <template #icon>
                    <icon-ic-round-refresh class="text-icon" />
                  </template>
                  {{ $t("common.reset") }}
                </NButton>
                <NButton type="primary" ghost @click="search">
                  <template #icon>
                    <icon-ic-round-search class="text-icon" />
                  </template>
                  {{ $t("common.search") }}
                </NButton>
              </NSpace>
            </NFormItemGi>
          </NGrid>
        </NForm>
      </NCollapseItem>
    </NCollapse>
  </NCard>
</template>
