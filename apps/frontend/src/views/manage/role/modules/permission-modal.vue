<script setup lang="ts">
  import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from "vue"
  import { routerKey } from "vue-router"
  import { useThemeVars } from "naive-ui"
  import { jsonClone } from "@rapidkit/utils"
  import { useOperationAccess } from "@/hooks/business/table-actions/use-operation-access"
  import {
    fetchGetAllPermissionPackages,
    fetchGetPermissionCatalog,
    fetchGetRolePermissions,
    fetchUpdateRolePermissions,
  } from "@/service/api"
  import { $t } from "@/locales"
  import { buildPermissionRows, expandImpliedCodes, splitKnownCodes } from "./permission-matrix"
  import { diffPermissionDraft, packagesForResource } from "./permission-draft"
  import type { RoleGrant } from "./package-apply-diff"
  import {
    invalidScopeKey,
    invalidScopeKeys,
    type DataScopes,
    type FieldModes,
    type InvalidScope,
  } from "./resource-scope"
  import PermissionResourceEditor from "./permission-resource-editor.vue"
  import PermissionChangeReview from "./permission-change-review.vue"

  defineOptions({ name: "PermissionModal" })
  const props = defineProps<{ roleId: string; roleName?: string }>()
  const emit = defineEmits<{ saved: [] }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const operationAccess = useOperationAccess(() => "role:grant", visible)
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--fill-color": theme.value.actionColor,
  }))
  const loading = ref(false)
  const loaded = ref(false)
  const saving = ref(false)
  const catalog = shallowRef<Api.Permission.Catalog | null>(null)
  const packages = shallowRef<Api.PermissionPackage.Package[]>([])
  const selected = ref<string[]>([])
  const invalidCodes = ref<string[]>([])
  const dataScopes = ref<DataScopes>({})
  const fieldModes = ref<FieldModes>({})
  const invalidScopes = ref<InvalidScope[]>([])
  const repairAcknowledged = ref(false)
  const focus = ref("")
  const resourceNavigation = ref<HTMLElement | null>(null)
  const reviewing = ref(false)
  const baseline = ref<RoleGrant>({ permissionCodes: [], dataScopes: {}, fieldModes: {} })
  let version = 0

  const rows = computed(() => (catalog.value ? buildPermissionRows(catalog.value) : []))
  const activeRow = computed(() => rows.value.find((row) => row.resource.key === focus.value) ?? rows.value[0])
  const draft = computed<RoleGrant>(() => ({
    permissionCodes: [...selected.value, ...invalidCodes.value],
    dataScopes: dataScopes.value,
    fieldModes: fieldModes.value,
  }))
  const diff = computed(() => (catalog.value ? diffPermissionDraft(baseline.value, draft.value, catalog.value) : null))
  const dirty = computed(() => !!diff.value?.hasChanges || repairAcknowledged.value)
  const busy = computed(() => loading.value || !loaded.value || saving.value || !operationAccess.value)
  const canSave = computed(
    () =>
      !busy.value &&
      dirty.value &&
      !invalidCodes.value.length &&
      (!invalidScopes.value.length || repairAcknowledged.value),
  )
  const invalidKeys = computed(() =>
    repairAcknowledged.value ? new Set<string>() : invalidScopeKeys(invalidScopes.value),
  )
  const implied = computed(() => (catalog.value ? expandImpliedCodes(selected.value, catalog.value) : []))
  const effective = computed(() => new Set([...selected.value, ...implied.value]))
  const resourcePackages = computed(() => packagesForResource(packages.value, activeRow.value?.resource.key ?? ""))
  const resourceOptions = computed(() =>
    rows.value.map((row) => ({ label: row.resource.label, value: row.resource.key })),
  )

  function setDraft(next: RoleGrant) {
    const known = catalog.value ? splitKnownCodes(next.permissionCodes, [], catalog.value) : { known: [], invalid: [] }
    selected.value = known.known
    invalidCodes.value = known.invalid
    dataScopes.value = { ...next.dataScopes }
    fieldModes.value = jsonClone(next.fieldModes)
  }
  function resetDraft() {
    setDraft(baseline.value)
    repairAcknowledged.value = false
    reviewing.value = false
  }
  async function confirmClose(): Promise<boolean> {
    if (saving.value) return false
    if (!dirty.value) return true
    if (!window.$dialog) return false
    const currentVersion = version
    return new Promise((resolve) => {
      window.$dialog!.warning({
        title: $t("page.manage.role.workbench.unsavedTitle"),
        content: $t("page.manage.role.workbench.unsavedHint"),
        positiveText: $t("page.manage.role.workbench.discard"),
        negativeText: $t("page.manage.role.workbench.continueEditing"),
        maskClosable: false,
        closeOnEsc: false,
        onPositiveClick: () => {
          resolve(version === currentVersion && !saving.value)
        },
        onNegativeClick: () => {
          resolve(false)
        },
        onClose: () => {
          resolve(false)
        },
      })
    })
  }
  async function closeModal() {
    if (await confirmClose()) visible.value = false
  }
  const removeRouteGuard = inject(routerKey, undefined)?.beforeEach(async () => {
    if (!visible.value) return true
    const allowed = await confirmClose()
    if (allowed) visible.value = false
    return allowed
  })
  async function loadData() {
    const currentVersion = ++version
    const roleId = props.roleId
    loading.value = true
    loaded.value = false
    reviewing.value = false
    repairAcknowledged.value = false
    selected.value = []
    invalidCodes.value = []
    invalidScopes.value = []
    catalog.value = null
    packages.value = []
    dataScopes.value = {}
    fieldModes.value = {}
    baseline.value = { permissionCodes: [], dataScopes: {}, fieldModes: {} }
    try {
      const [catalogRes, permissionRes, packageRes] = await Promise.all([
        fetchGetPermissionCatalog(),
        fetchGetRolePermissions(roleId),
        fetchGetAllPermissionPackages(),
      ])
      if (currentVersion !== version || !visible.value || catalogRes.error || permissionRes.error || packageRes.error)
        return
      catalog.value = catalogRes.data
      packages.value = packageRes.data
      const split = splitKnownCodes(
        permissionRes.data.permissionCodes,
        permissionRes.data.invalidCodes,
        catalogRes.data,
      )
      baseline.value = {
        permissionCodes: [...split.known, ...split.invalid],
        dataScopes: { ...permissionRes.data.dataScopes },
        fieldModes: jsonClone(permissionRes.data.fieldModes),
      }
      invalidScopes.value = [...permissionRes.data.invalidScopes]
      setDraft(baseline.value)
      focus.value =
        rows.value.find((row) => row.resource.key === "user")?.resource.key ?? rows.value[0]?.resource.key ?? ""
      loaded.value = true
    } catch {
      // The request layer reports transport errors. Keep the editor locked until a complete retry succeeds.
    } finally {
      if (currentVersion === version) loading.value = false
    }
  }
  async function handleSubmit() {
    if (!reviewing.value || !canSave.value) return
    const roleId = props.roleId
    const currentVersion = version
    const payload = jsonClone(draft.value)
    saving.value = true
    try {
      if (!operationAccess.value) return
      const { error } = await fetchUpdateRolePermissions(roleId, payload)
      if (error || currentVersion !== version || roleId !== props.roleId) return
      window.$message?.success?.($t("common.modifySuccess"))
      baseline.value = payload
      repairAcknowledged.value = false
      visible.value = false
      emit("saved")
    } finally {
      saving.value = false
    }
  }
  function protectUnload(event: BeforeUnloadEvent) {
    if (!visible.value || !dirty.value) return
    event.preventDefault()
    event.returnValue = ""
  }
  window.addEventListener("beforeunload", protectUnload)
  onBeforeUnmount(() => {
    ++version
    removeRouteGuard?.()
    window.removeEventListener("beforeunload", protectUnload)
  })
  watch(
    [focus, loaded],
    () => {
      if (loaded.value)
        resourceNavigation.value?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: "nearest" })
    },
    { flush: "post" },
  )
  watch(
    [visible, () => props.roleId],
    ([show]) => {
      if (show) void loadData()
      else {
        ++version
        loaded.value = false
        loading.value = false
      }
    },
    { immediate: true },
  )
</script>

<template>
  <NModal
    :show="visible"
    :title="`${$t('page.manage.role.permissionConfig')} · ${roleName || roleId}`"
    preset="card"
    :style="themeStyle"
    content-style="display: flex; flex-direction: column; min-height: 0; overflow: hidden"
    header-style="flex-shrink: 0"
    footer-style="flex-shrink: 0"
    class="permission-modal w-1200px max-w-[calc(100vw-24px)]"
    :mask-closable="!saving"
    :close-on-esc="!saving"
    :closable="!saving"
    @update:show="
      (show) => {
        if (!show) closeModal()
      }
    "
  >
    <NSpin :show="loading" class="min-h-0 flex-1" content-class="h-full min-h-0 flex-col">
      <div class="min-h-0 flex-1 flex-col gap-16px">
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-8px text-12px text-base-text-3">
          <span>{{ $t("page.manage.role.workbench.subtitle") }}</span>
          <NTag v-if="loaded" :type="dirty ? 'warning' : 'default'" size="small" :bordered="false">
            {{ $t(dirty ? "page.manage.role.workbench.unsaved" : "page.manage.role.workbench.saved") }}
          </NTag>
        </div>
        <NAlert v-if="visible && !loading && !loaded" type="error" :title="$t('page.manage.role.workbench.loadFailed')">
          <NButton size="small" @click="loadData">{{ $t("page.manage.role.workbench.retry") }}</NButton>
        </NAlert>
        <template v-if="loaded && catalog">
          <NScrollbar
            v-if="invalidCodes.length || (invalidScopes.length && !repairAcknowledged)"
            class="max-h-120px min-h-0 shrink-0"
            content-class="flex-col gap-8px pr-18px"
          >
            <NAlert v-if="invalidCodes.length" type="error" :title="$t('page.manage.role.workbench.invalidCodesHint')">
              <div class="mb-8px flex flex-wrap gap-6px">
                <NTag v-for="code in invalidCodes" :key="code" size="small" type="error">{{ code }}</NTag>
              </div>
              <NButton size="small" :disabled="busy" @click="invalidCodes = []">{{
                $t("page.manage.role.workbench.removeInvalid")
              }}</NButton>
            </NAlert>
            <NAlert
              v-if="invalidScopes.length && !repairAcknowledged"
              type="warning"
              :title="$t('page.manage.role.invalidScopes')"
            >
              <div
                v-for="item in invalidScopes"
                :key="invalidScopeKey(item.resource, item.group)"
                class="mb-4px break-words"
              >
                {{ invalidScopeKey(item.resource, item.group) }}: {{ item.stored }} → {{ item.effective }}
              </div>
              <NButton size="small" :disabled="busy" @click="repairAcknowledged = true">{{
                $t("page.manage.role.workbench.repairInvalid")
              }}</NButton>
            </NAlert>
          </NScrollbar>
          <NScrollbar v-if="reviewing && diff" class="min-h-0 flex-1" content-class="flex-col gap-16px pr-18px">
            <h3 class="m-0 font-600">{{ $t("page.manage.role.workbench.reviewTitle") }}</h3>
            <PermissionChangeReview
              :diff="diff"
              :catalog="catalog"
              :repairs="repairAcknowledged ? invalidScopes : []"
            />
          </NScrollbar>
          <template v-else>
            <div class="permission-workspace min-h-0 flex-1 gap-20px">
              <nav
                ref="resourceNavigation"
                class="resource-nav min-h-0 min-w-0 flex-col"
                :aria-label="$t('page.manage.role.workbench.resources')"
              >
                <div class="mb-8px px-2px text-12px text-base-text-3">
                  {{ $t("page.manage.role.workbench.resources") }}
                </div>
                <NScrollbar
                  class="min-h-0 flex-1"
                  vertical-rail-style="right: 0"
                  content-class="flex-col gap-4px py-2px pr-18px"
                >
                  <button
                    v-for="row in rows"
                    :key="row.resource.key"
                    type="button"
                    class="resource-item relative min-h-36px flex items-center justify-between gap-8px border border-theme-default rd-6px bg-transparent py-6px pl-16px pr-10px text-left text-13px text-base-text-2 transition-colors hover:bg-theme-fill"
                    :class="{ 'resource-active': activeRow?.resource.key === row.resource.key }"
                    :aria-pressed="activeRow?.resource.key === row.resource.key"
                    :disabled="busy"
                    @click="focus = row.resource.key"
                  >
                    <span class="font-500">{{ row.resource.label }}</span>
                    <span
                      class="resource-count shrink-0 rd-4px bg-theme-fill px-6px py-1px text-12px tabular-nums text-base-text-3"
                    >
                      {{ row.codes.filter((c) => effective.has(c.code)).length }}/{{ row.codes.length }}
                    </span>
                  </button>
                </NScrollbar>
              </nav>
              <div class="resource-picker">
                <NSelect
                  v-model:value="focus"
                  :options="resourceOptions"
                  :disabled="busy"
                  :aria-label="$t('page.manage.role.workbench.resources')"
                />
              </div>
              <PermissionResourceEditor
                v-if="activeRow"
                :key="activeRow.resource.key"
                v-model:selected="selected"
                v-model:data-scopes="dataScopes"
                v-model:field-modes="fieldModes"
                :row="activeRow"
                :catalog="catalog"
                :packages="resourcePackages"
                :disabled="busy"
                :invalid-keys="invalidKeys"
              />
              <NEmpty v-else :description="$t('page.manage.role.workbench.emptyResources')" />
            </div>
          </template>
        </template>
      </div>
    </NSpin>
    <template #footer>
      <div
        class="flex flex-col items-stretch justify-between gap-12px border-t border-theme-default pt-16px sm:flex-row sm:items-center"
      >
        <div aria-live="polite" class="h-36px min-w-0 text-12px leading-18px text-base-text-3">
          <div v-if="loaded">
            {{ $t("page.manage.role.workbench.counts", { direct: selected.length, implied: implied.length }) }}
          </div>
          <span v-if="dirty && diff" class="block truncate">{{
            $t("page.manage.role.workbench.changes", {
              added: diff.addedCodes.length,
              removed: diff.removedCodes.length,
              scopes: diff.scopeChanges.length,
            })
          }}</span>
          <span v-else class="block truncate">{{ $t("page.manage.role.workbench.noChanges") }}</span>
        </div>
        <div class="flex shrink-0 justify-end gap-8px">
          <NButton :disabled="saving" @click="closeModal">{{ $t("common.cancel") }}</NButton>
          <NButton v-if="!reviewing" :disabled="busy || !dirty" @click="resetDraft">{{
            $t("page.manage.role.workbench.reset")
          }}</NButton>
          <NButton v-if="reviewing" :disabled="busy" @click="reviewing = false">{{
            $t("page.manage.role.workbench.back")
          }}</NButton>
          <NButton v-if="reviewing" type="primary" :disabled="!canSave" :loading="saving" @click="handleSubmit">{{
            $t("page.manage.role.workbench.save")
          }}</NButton>
          <NButton v-else type="primary" :disabled="!canSave" @click="reviewing = true">{{
            $t("page.manage.role.workbench.review")
          }}</NButton>
        </div>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
  :global(.permission-modal) {
    height: min(820px, calc(100dvh - 48px));
  }
  .permission-workspace {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
  }
  .resource-nav {
    border-right: 1px solid var(--border-color);
  }
  .resource-active {
    color: rgb(var(--primary-color));
    background: rgb(var(--primary-color) / 0.1);
    border-color: rgb(var(--primary-color));
  }
  .resource-active::before {
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: 5px;
    width: 3px;
    border-radius: 2px;
    background: rgb(var(--primary-color));
    content: "";
  }
  .resource-active .resource-count {
    color: rgb(var(--primary-color));
    background: rgb(var(--primary-color) / 0.12);
  }
  .resource-picker {
    display: none;
  }
  @media (max-width: 640px) {
    :global(.permission-modal) {
      height: calc(100dvh - 24px);
    }
    .permission-workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .resource-nav {
      display: none;
    }
    .resource-picker {
      display: block;
    }
  }
</style>
