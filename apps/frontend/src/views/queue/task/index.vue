<script setup lang="ts">
  import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from "vue"
  import { useRoute, useRouter } from "vue-router"
  import { taskStatusOptions } from "@/constants/business"
  import { translateOptions } from "@/utils/common"
  import { applyTaskSearch, resetTaskSearch } from "./composables/task-search"
  import TaskGroups from "./modules/task-groups.vue"
  import {
    readTaskView,
    writeTaskView,
    drillTask,
    timeRange,
    validRange,
    refreshTaskRange,
  } from "./composables/task-view-state"
  import { useAppSocket } from "@/hooks/common/app-socket"
  import { $t } from "@/locales"
  import { useAuth } from "@/hooks/business/auth"
  import TaskStream from "./modules/task-stream.vue"
  import TaskDrawer from "./modules/task-drawer.vue"
  import TriggerModal from "./modules/trigger-modal.vue"

  defineOptions({
    name: "QueueTask",
  })

  const route = useRoute()
  const router = useRouter()
  const state = reactive(readTaskView(route.query))
  const draft = reactive({ ...state })
  const searchRevision = ref(0)
  const taskGroupsRef = ref<InstanceType<typeof TaskGroups> | null>(null)
  const customRange = computed<[number, number] | null>({
    get: (): [number, number] => [Date.parse(draft.start), Date.parse(draft.end)],
    set: (value: [number, number] | null) => {
      if (!value) return
      const start = new Date(value[0]).toISOString(),
        end = new Date(value[1]).toISOString()
      if (validRange(start, end)) {
        draft.start = start
        draft.end = end
      } else window.$message?.warning($t("page.manage.worker.invalidTimeRange"))
    },
  })
  const recordFilters = computed(() => ({
    taskName: state.task || state.keyword || undefined,
    taskNameMatch: state.task ? ("exact" as const) : ("contains" as const),
    workerHostname: state.worker || undefined,
    status: state.status,
    startTime: state.start,
    endTime: state.end,
  }))
  const groupQuery = computed(() => ({
    page: state.page,
    pageSize: state.pageSize,
    taskName: state.keyword || undefined,
    workerHostname: state.worker || undefined,
    startTime: state.start,
    endTime: state.end,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
  }))
  const rangeOptions = computed(() =>
    (["24h", "7d", "30d", "custom"] as const).map((value) => ({
      value,
      label: $t(`page.manage.worker.range${value}`),
    })),
  )
  const sortOptions = computed(() =>
    (["lastExecutedAt", "total", "failure"] as const).map((value) => ({
      value,
      label: $t(`page.manage.worker.sort${value}`),
    })),
  )
  function changeRange(value: typeof state.preset) {
    draft.preset = value
    if (value !== "custom") Object.assign(draft, timeRange(value))
  }
  function toggleSortOrder() {
    draft.sortOrder = draft.sortOrder === "desc" ? "asc" : "desc"
  }
  function changeGroupPageSize(size: number) {
    state.pageSize = size
    state.page = 1
  }
  function drill(task: string, failure: boolean) {
    Object.assign(state, drillTask(state, task, failure))
    draft.status = state.status
  }
  function backToGroups() {
    state.view = "groups"
    state.task = ""
    state.status = undefined
    draft.status = undefined
  }
  function setKeyword(value: string | null) {
    draft.keyword = value || ""
  }
  function setWorker(value: string | null) {
    draft.worker = value || ""
  }
  const recordResetKey = computed(() =>
    JSON.stringify([
      searchRevision.value,
      state.task,
      state.keyword,
      state.worker,
      state.status,
      state.preset,
      ...(state.preset === "custom" ? [state.start, state.end] : []),
    ]),
  )
  watch(
    state,
    () => {
      router.replace({ query: { ...route.query, ...writeTaskView(state) } })
    },
    { deep: true },
  )
  watch(
    () => route.query,
    (query) => {
      const next = readTaskView(query)
      if (JSON.stringify(writeTaskView(next)) !== JSON.stringify(writeTaskView(state))) {
        Object.assign(state, next)
        Object.assign(draft, next)
      }
    },
  )

  function search() {
    const next = applyTaskSearch(state, draft)
    const unchanged = JSON.stringify(writeTaskView(next)) === JSON.stringify(writeTaskView(state))
    Object.assign(state, next)
    searchRevision.value++
    if (unchanged && state.view === "groups") taskGroupsRef.value?.refresh()
  }
  function resetSearch() {
    Object.assign(draft, resetTaskSearch(state))
    state.task = ""
    search()
  }

  const { hasAuth } = useAuth()

  // ==================== Task Drawer ====================
  const taskDrawerVisible = ref(false)
  const selectedTaskId = ref<string | null>(null)

  function handleTaskSelect(taskId: string) {
    selectedTaskId.value = taskId
    taskDrawerVisible.value = true
  }

  // ==================== Trigger Modal ====================
  const triggerModalVisible = ref(false)

  // ==================== Task Stream Ref ====================
  const taskStreamRef = ref<InstanceType<typeof TaskStream> | null>(null)

  function handleTaskSubmitted() {
    if (state.preset !== "custom") Object.assign(state, refreshTaskRange(state))
    else {
      taskStreamRef.value?.refresh()
      taskGroupsRef.value?.refresh()
    }
  }
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  onBeforeUnmount(() => clearTimeout(refreshTimer))

  // ==================== Socket.IO ====================
  const { on, connect } = useAppSocket()

  function setupSocket() {
    connect("/worker")

    on("task:update", () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(handleTaskSubmitted, 300)
    })
  }

  // ==================== Lifecycle ====================
  onMounted(() => {
    router.replace({ query: { ...route.query, ...writeTaskView(state) } })
    setupSocket()
  })
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard :bordered="false" size="small" class="card-wrapper">
      <NCollapse :default-expanded-names="['task-search']">
        <NCollapseItem :title="$t('common.search')" name="task-search">
          <div class="flex flex-wrap items-center gap-12px">
            <NButtonGroup>
              <NButton :type="state.view === 'records' ? 'primary' : 'default'" @click="state.view = 'records'">{{
                $t("page.manage.worker.recordsView")
              }}</NButton>
              <NButton :type="state.view === 'groups' ? 'primary' : 'default'" @click="backToGroups">{{
                $t("page.manage.worker.groupsView")
              }}</NButton>
            </NButtonGroup>
            <NSelect :value="draft.preset" :options="rangeOptions" class="w-150px" @update:value="changeRange" />
            <NDatePicker
              v-if="draft.preset === 'custom'"
              v-model:value="customRange"
              type="datetimerange"
              class="max-w-full w-380px"
            />
            <NInput
              :value="draft.keyword"
              @update:value="setKeyword"
              :placeholder="$t('page.manage.worker.form.taskName')"
              :disabled="Boolean(state.task)"
              clearable
              style="width: 200px; max-width: 100%"
            />
            <NInput
              :value="draft.worker"
              @update:value="setWorker"
              :placeholder="$t('page.manage.worker.workerHostname')"
              clearable
              style="width: 180px; max-width: 100%"
            />
            <NSelect
              v-if="state.view === 'records'"
              :value="draft.status ?? null"
              @update:value="draft.status = $event ?? undefined"
              :placeholder="$t('page.manage.worker.form.status')"
              :options="translateOptions(taskStatusOptions)"
              clearable
              class="w-130px"
            />
            <template v-else>
              <NSelect v-model:value="draft.sortBy" :options="sortOptions" style="width: 180px; max-width: 100%" />
              <NButton @click="toggleSortOrder">{{
                $t(
                  draft.sortOrder === "desc" ? "page.manage.worker.sortDescending" : "page.manage.worker.sortAscending",
                )
              }}</NButton>
            </template>
            <NSpace class="ml-auto" justify="end">
              <NButton @click="resetSearch">
                <template #icon><icon-ic-round-refresh class="text-icon" /></template>
                {{ $t("common.reset") }}
              </NButton>
              <NButton type="primary" ghost @click="search">
                <template #icon><icon-ic-round-search class="text-icon" /></template>
                {{ $t("common.search") }}
              </NButton>
            </NSpace>
          </div>
          <p v-if="state.view === 'groups'" class="mb-0 mt-12px text-12px text-base-text-3">
            {{ $t("page.manage.worker.groupCountingHint") }}
          </p>
          <div class="mt-8px text-12px text-base-text-3">
            {{ new Date(state.start).toLocaleString() }} – {{ new Date(state.end).toLocaleString() }}
          </div>
        </NCollapseItem>
      </NCollapse>
      <div v-if="state.task && state.view === 'records'" class="mt-12px flex flex-wrap items-center gap-12px">
        <NButton size="small" @click="backToGroups">{{ $t("page.manage.worker.backToGroups") }}</NButton>
        <NTag type="info">{{ state.task }}</NTag>
        <NButton size="small" @click="state.task = ''">{{ $t("page.manage.worker.clearExactTask") }}</NButton>
      </div>
    </NCard>
    <TaskGroups
      v-if="state.view === 'groups'"
      ref="taskGroupsRef"
      :query="groupQuery"
      @drill="drill"
      @page="state.page = $event"
      @page-size="changeGroupPageSize"
      @refresh="handleTaskSubmitted"
    />
    <TaskStream
      v-else
      ref="taskStreamRef"
      :filters="recordFilters"
      :reset-key="recordResetKey"
      @select="handleTaskSelect"
      @refresh="handleTaskSubmitted"
    >
      <template #header-extra>
        <NButton v-if="hasAuth('task:trigger')" size="small" ghost type="primary" @click="triggerModalVisible = true">
          <template #icon>
            <icon-ic-round-play-arrow class="text-icon" />
          </template>
          {{ $t("page.manage.worker.triggerTask") }}
        </NButton>
      </template>
    </TaskStream>

    <TaskDrawer v-model:visible="taskDrawerVisible" :task-id="selectedTaskId" />
    <TriggerModal v-model:visible="triggerModalVisible" @submitted="handleTaskSubmitted" />
  </div>
</template>
