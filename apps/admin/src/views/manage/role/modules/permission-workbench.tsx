import { useEffect, useState } from "react"
import { useBlocker } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { getAuthSession } from "@/services/auth-session"
import {
  fetchPermissionCatalog,
  fetchPermissionMenus,
  fetchPermissionPackages,
  fetchRolePermissions,
  updateRolePermissions,
  type PermissionMenu,
} from "@/services/api/role"
import { requireRolePermission, roleQueryKeys, unwrapRoleRequest } from "@/services/hooks/use-roles"
import { useAuthStore } from "@/stores/auth"
import type { RoleGrant } from "./package-apply-diff"
import { diffPermissionDraft, applyPermissionSelection } from "./permission-draft"
import { buildPermissionRows, expandImpliedCodes, splitKnownCodes } from "./permission-matrix"
import { buildPermissionModules } from "./permission-menu-groups"
import { invalidScopeKey, invalidScopeKeys } from "./resource-scope"
import { PermissionResourceEditor, ScopeSelect } from "./permission-resource-editor"
import { PermissionChangeReview } from "./permission-change-review"

type Props = { roleId: string; roleName: string; onClose: () => void }
async function loadPermissions(roleId: string) {
  const [catalog, permissions, packages] = await Promise.all([
    unwrapRoleRequest(fetchPermissionCatalog()),
    unwrapRoleRequest(fetchRolePermissions(roleId)),
    unwrapRoleRequest(fetchPermissionPackages()),
  ])
  const split = splitKnownCodes(permissions.permissionCodes, permissions.invalidCodes, catalog)
  return {
    catalog,
    permissions,
    packages,
    baseline: {
      permissionCodes: [...split.known, ...split.invalid],
      dataScopes: permissions.dataScopes,
      fieldModes: permissions.fieldModes,
    },
  }
}
export function PermissionWorkbench(props: Props) {
  const { t } = useTranslation()
  useAuthStore((s) => s.token)
  const session = getAuthSession()
  const query = useQuery({
    queryKey: ["role-grant", session, props.roleId],
    queryFn: () => loadPermissions(props.roleId),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
  const identity = `${session}:${props.roleId}`
  const [snapshot, setSnapshot] = useState<{
    identity: string
    data: Awaited<ReturnType<typeof loadPermissions>>
  } | null>(null)
  const opened = snapshot?.identity === identity ? snapshot.data : null
  // A fresh initial snapshot starts an editor; background refreshes cannot replace its unsaved draft.
  useEffect(() => {
    if (!opened && query.isSuccess && !query.isFetching) setSnapshot({ identity, data: query.data })
  }, [identity, opened, query.isSuccess, query.isFetching, query.data])
  return opened ? (
    <PermissionEditor key={identity} {...props} data={opened} session={session} />
  ) : (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("role.permissionConfig")} · {props.roleName}
          </DialogTitle>
          <DialogDescription>{t("role.workbench.subtitle")}</DialogDescription>
        </DialogHeader>
        <p role={query.isError ? "alert" : "status"}>
          {t(query.isError ? "role.workbench.loadFailed" : "common.loading")}
        </p>
        {query.isError && <Button onClick={() => void query.refetch()}>{t("role.workbench.retry")}</Button>}
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled>{t("role.workbench.review")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
function PermissionEditor({
  data,
  session,
  ...props
}: Props & { data: Awaited<ReturnType<typeof loadPermissions>>; session: number }) {
  const { t } = useTranslation()
  const access = usePermission("role:grant")
  const client = useQueryClient()
  const [baseline, setBaseline] = useState<RoleGrant>(data.baseline)
  const [draft, setDraft] = useState<RoleGrant>(data.baseline)
  const [repaired, setRepaired] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [focus, setFocus] = useState("")
  const [search, setSearch] = useState("")
  const { catalog, packages, permissions } = data
  const split = splitKnownCodes(
    draft.permissionCodes,
    permissions.invalidCodes.filter((code) => draft.permissionCodes.includes(code)),
    catalog,
  )
  const diff = diffPermissionDraft(baseline, draft, catalog)
  const dirty = diff.hasChanges || repaired
  const blocker = useBlocker(dirty)
  const menuQuery = useQuery({
    queryKey: ["permission-menus", session],
    staleTime: 0,
    queryFn: async () => {
      const menus: PermissionMenu[] = []
      for (let page = 1; ; page++) {
        const result = await unwrapRoleRequest(fetchPermissionMenus({ page, pageSize: 500 }))
        if (!result.records.length && menus.length < result.total) throw new Error("Incomplete menu snapshot")
        menus.push(...result.records)
        if (menus.length >= result.total) return menus
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  })
  const localizeMenus = (items: PermissionMenu[]): PermissionMenu[] =>
    items.map((item) => ({
      ...item,
      menuName: item.i18nKey ? t(item.i18nKey, { defaultValue: item.menuName }) : item.menuName,
      children: item.children ? localizeMenus(item.children) : item.children,
    }))
  const grouping =
    menuQuery.data && !menuQuery.isError ? buildPermissionModules(catalog, localizeMenus(menuQuery.data)) : null
  const allModules =
    grouping?.modules.map((m) => ({ ...m, label: m.key === "other" ? t("role.workbench.otherResources") : m.label })) ??
    buildPermissionRows(catalog).map((row) => ({
      key: row.resource.key,
      label: row.resource.label,
      entries: [{ row, path: [], ownerKey: row.resource.key }],
    }))
  const term = search.trim().toLocaleLowerCase()
  const modules = allModules.filter(
    (m) =>
      !term ||
      [
        m.label,
        ...m.entries.flatMap((e) => [
          e.row.resource.label,
          ...e.path,
          ...e.row.codes.flatMap((c) => [c.code, c.label]),
        ]),
      ].some((s) => s.toLocaleLowerCase().includes(term)),
  )
  const active =
    modules.find((m) => m.key === focus) ??
    modules.find((m) => m.entries.some((e) => e.row.resource.key === "user" && e.ownerKey === m.key)) ??
    modules[0]
  const direct = new Set(split.known),
    implied = expandImpliedCodes(split.known, catalog),
    effective = new Set([...direct, ...implied])
  const invalidKeys = repaired ? new Set<string>() : invalidScopeKeys(permissions.invalidScopes)
  const save = useMutation({
    mutationFn: async () => {
      requireRolePermission("role:grant", session)
      if (!reviewing || !dirty || split.invalid.length || (permissions.invalidScopes.length && !repaired))
        throw new Error("Permission draft is not ready")
      return unwrapRoleRequest(updateRolePermissions(props.roleId, draft))
    },
    onSuccess: async () => {
      if (session !== getAuthSession()) return
      setBaseline(draft)
      setRepaired(false)
      await client.invalidateQueries({ queryKey: roleQueryKeys.all(session) })
      client.removeQueries({ queryKey: ["role-grant", session, props.roleId], exact: true })
      toast.success(t("common.success"))
      props.onClose()
    },
  })
  const busy = save.isPending || !access
  const canSave = !busy && dirty && !split.invalid.length && (!permissions.invalidScopes.length || repaired)
  useEffect(() => {
    if (!dirty) return
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", protect)
    return () => window.removeEventListener("beforeunload", protect)
  }, [dirty])
  const requestClose = () => {
    if (save.isPending) return
    if (dirty) setClosing(true)
    else props.onClose()
  }
  const focusResource = (key: string) => {
    const owner = allModules.find((m) => m.entries.some((e) => e.row.resource.key === key && e.ownerKey === m.key))
    if (owner) {
      setSearch("")
      setFocus(owner.key)
    }
  }
  const count = (m: (typeof allModules)[number]) => {
    const codes = m.entries.filter((e) => e.ownerKey === m.key).flatMap((e) => e.row.codes)
    return `${codes.filter((c) => effective.has(c.code)).length}/${codes.length}`
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose()
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              {t("role.permissionConfig")} · {props.roleName}
            </DialogTitle>
            <DialogDescription>{t("role.workbench.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 gap-3 overflow-y-auto">
            <Badge variant="secondary">{t(dirty ? "role.workbench.unsaved" : "role.workbench.saved")}</Badge>
            {!access && <p role="alert">{t("role.noAccess")}</p>}
            {!!split.invalid.length && (
              <div role="alert" className="grid gap-2 rounded-md border border-destructive p-3">
                <p>{t("role.workbench.invalidCodesHint")}</p>
                <p className="break-all text-sm">{split.invalid.join(", ")}</p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDraft({ ...draft, permissionCodes: split.known })}
                >
                  {t("role.workbench.removeInvalid")}
                </Button>
              </div>
            )}
            {!!permissions.invalidScopes.length && !repaired && (
              <div role="alert" className="grid gap-2 rounded-md border p-3">
                <p>{t("role.invalidScopes")}</p>
                {permissions.invalidScopes.map((item) => (
                  <p className="break-all text-sm" key={invalidScopeKey(item.resource, item.group)}>
                    {invalidScopeKey(item.resource, item.group)}: {item.stored} → {item.effective}
                  </p>
                ))}
                <Button variant="outline" disabled={busy} onClick={() => setRepaired(true)}>
                  {t("role.workbench.repairInvalid")}
                </Button>
              </div>
            )}
            {menuQuery.isError && !reviewing && (
              <div role="alert" className="grid gap-2 rounded-md border p-3">
                <p>{t("role.workbench.menuLoadFailed")}</p>
                <Button
                  variant="outline"
                  disabled={busy || menuQuery.isFetching}
                  onClick={() => void menuQuery.refetch()}
                >
                  {t("role.workbench.retryMenus")}
                </Button>
              </div>
            )}
            {!!grouping?.invalidMenuPermissions.length && (
              <p role="alert">
                {t("role.workbench.unknownMenuPermission")} {grouping.invalidMenuPermissions.join(", ")}
              </p>
            )}
            {reviewing ? (
              <>
                <h3 className="font-semibold">{t("role.workbench.reviewTitle")}</h3>
                <PermissionChangeReview
                  diff={diff}
                  catalog={catalog}
                  modules={allModules}
                  repairs={repaired ? permissions.invalidScopes : []}
                />
              </>
            ) : menuQuery.isFetching ? (
              <p role="status">{t("common.loading")}</p>
            ) : (
              <div className="grid min-h-0 gap-4 sm:grid-cols-[190px_minmax(0,1fr)]">
                <nav
                  aria-label={t(grouping ? "role.workbench.modules" : "role.workbench.resources")}
                  className="hidden content-start gap-1 sm:grid"
                >
                  {modules.map((m) => (
                    <Button
                      className="h-auto justify-between whitespace-normal text-left"
                      key={m.key}
                      variant={active?.key === m.key ? "secondary" : "ghost"}
                      aria-pressed={active?.key === m.key}
                      disabled={busy}
                      onClick={() => setFocus(m.key)}
                    >
                      {m.label}
                      <span className="text-xs">{count(m)}</span>
                    </Button>
                  ))}
                </nav>
                <div className="grid min-w-0 content-start gap-3">
                  <div className="sm:hidden">
                    <ScopeSelect
                      label={t(grouping ? "role.workbench.modules" : "role.workbench.resources")}
                      value={active?.key ?? ""}
                      items={modules.map((m) => ({ value: m.key, label: `${m.label} ${count(m)}` }))}
                      disabled={busy}
                      onChange={setFocus}
                    />
                  </div>
                  <Input
                    value={search}
                    disabled={busy}
                    aria-label={t("role.workbench.search")}
                    placeholder={t("role.workbench.search")}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {active ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {(["all", "readonly", "clear"] as const).map((mode) => (
                          <Button
                            variant="outline"
                            size="sm"
                            key={mode}
                            disabled={busy}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                permissionCodes: applyPermissionSelection(
                                  draft.permissionCodes,
                                  active.entries.filter((e) => e.ownerKey === active.key).flatMap((e) => e.row.codes),
                                  mode,
                                ),
                              })
                            }
                          >
                            {t(
                              {
                                all: "role.workbench.moduleAll",
                                readonly: "role.workbench.moduleReadonly",
                                clear: "role.workbench.moduleClear",
                              }[mode],
                            )}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("role.workbench.moduleBulkHint", {
                          count: active.entries.filter((e) => e.ownerKey === active.key).flatMap((e) => e.row.codes)
                            .length,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("role.workbench.dependencyStillEffective")}</p>
                      {active.entries
                        .filter(
                          (entry) =>
                            !term ||
                            active.label.toLocaleLowerCase().includes(term) ||
                            [
                              entry.row.resource.label,
                              ...entry.path,
                              ...entry.row.codes.flatMap((c) => [c.code, c.label]),
                            ].some((s) => s.toLocaleLowerCase().includes(term)),
                        )
                        .map((entry) =>
                          entry.ownerKey !== active.key ? (
                            <Button
                              key={entry.row.resource.key}
                              variant="outline"
                              onClick={() => focusResource(entry.row.resource.key)}
                            >
                              {t("role.workbench.sharedResource", { name: entry.row.resource.label })}
                            </Button>
                          ) : (
                            <div key={entry.row.resource.key} className="grid gap-1">
                              {!!entry.path.length && (
                                <p className="text-xs text-muted-foreground">{entry.path.join(" / ")}</p>
                              )}
                              <PermissionResourceEditor
                                row={entry.row}
                                catalog={catalog}
                                packages={packages}
                                draft={draft}
                                onChange={setDraft}
                                disabled={busy}
                                invalidKeys={invalidKeys}
                                query={
                                  active.label.toLocaleLowerCase().includes(term) ||
                                  entry.row.resource.label.toLocaleLowerCase().includes(term) ||
                                  entry.path.some((p) => p.toLocaleLowerCase().includes(term))
                                    ? ""
                                    : search
                                }
                                onFocusResource={focusResource}
                              />
                            </div>
                          ),
                        )}
                    </>
                  ) : (
                    <p>{t("role.workbench.searchEmpty")}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-wrap border-t pt-3">
            <div aria-live="polite" className="mr-auto min-w-0 text-xs text-muted-foreground">
              <p>{t("role.workbench.counts", { direct: split.known.length, implied: implied.length })}</p>
              <p>
                {dirty
                  ? t("role.workbench.changes", {
                      added: diff.addedCodes.length,
                      removed: diff.removedCodes.length,
                      scopes: diff.scopeChanges.length,
                    })
                  : t("role.workbench.noChanges")}
              </p>
            </div>
            <Button variant="outline" disabled={save.isPending} onClick={requestClose}>
              {t("common.cancel")}
            </Button>
            {reviewing ? (
              <>
                <Button variant="outline" disabled={busy} onClick={() => setReviewing(false)}>
                  {t("role.workbench.back")}
                </Button>
                <Button
                  disabled={!canSave}
                  onClick={() => {
                    void save.mutateAsync().catch(() => {})
                  }}
                >
                  {t(save.isPending ? "form.submitting" : "role.workbench.save")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={busy || !dirty}
                  onClick={() => {
                    setDraft(baseline)
                    setRepaired(false)
                    setReviewing(false)
                  }}
                >
                  {t("role.workbench.reset")}
                </Button>
                <Button disabled={!canSave} onClick={() => setReviewing(true)}>
                  {t("role.workbench.review")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={closing || blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && !save.isPending) {
            setClosing(false)
            if (blocker.state === "blocked") blocker.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("role.workbench.unsavedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("role.workbench.unsavedHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                setClosing(false)
                if (blocker.state === "blocked") blocker.reset()
              }}
            >
              {t("role.workbench.continueEditing")}
            </Button>
            <Button
              variant="destructive"
              disabled={save.isPending}
              onClick={() => {
                setClosing(false)
                if (blocker.state === "blocked") blocker.proceed()
                else props.onClose()
              }}
            >
              {t("role.workbench.discard")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
