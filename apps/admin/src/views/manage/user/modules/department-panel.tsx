import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Building2, ChevronDown, ChevronRight, CornerDownRight, Folder, Home, MoreHorizontal, Plus } from "lucide-react"
import { Button, Input, toast } from "@rapidkit/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { usePermission } from "@/features/auth/permissions"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission } from "@/services/user-access"
import { useDepartmentOptions, useUserDepartmentCounts } from "@/services/hooks/use-user-options"
import { useDepartmentMutations } from "@/services/hooks/use-department-mutations"
import type { DepartmentTreeNode } from "@/services/api/department"
import { ConfirmActionDialog } from "@/shared/crud"
import { DepartmentOperateDrawer } from "./department-operate-drawer"
import {
  createDepartmentDirectory,
  departmentBreadcrumbs,
  departmentScopeForSelection,
  isDepartmentDepthBoundary,
  searchDepartments,
} from "./department-directory"

interface Props {
  selectedId: string
  onSelect: (id: string) => void
  onChanged?: () => void
}
type Scope = { id: string; path: string[] } | null
type Editor = { department?: DepartmentTreeNode; parentId?: string } | null
export function DepartmentPanel({ selectedId, onSelect, onChanged }: Props) {
  const { t } = useTranslation()
  const session = useRef(getAuthSession()).current
  const departments = useDepartmentOptions()
  const counts = useUserDepartmentCounts()
  const writes = useDepartmentMutations()
  const canCreate = usePermission("department:create"),
    canEdit = usePermission("department:update"),
    canDelete = usePermission("department:delete")
  const [keyword, setKeyword] = useState("")
  const [scope, setScope] = useState<Scope>(null)
  const [expanded, setExpanded] = useState(new Set<string>())
  const [collapsed, setCollapsed] = useState(new Set<string>())
  const [editor, setEditor] = useState<Editor>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteFailed, setDeleteFailed] = useState(false)
  const deleteBusy = useRef(false)
  const directoryElement = useRef<HTMLElement>(null)
  const members = counts.isError ? null : (counts.data ?? null)
  const index = useMemo(() => createDepartmentDirectory(departments.data ?? [], members), [departments.data, members])
  const latest = useRef({ index, failed: departments.isError })
  latest.current = { index, failed: departments.isError }
  const scopeId = scope
    ? index.has(scope.id)
      ? scope.id
      : ([...scope.path].reverse().find((id) => index.has(id)) ?? null)
    : null
  const scopePath = scopeId ? (index.get(scopeId)?.path ?? []) : []
  const roots = scopeId ? [index.get(scopeId)!.department] : (departments.data ?? [])
  const search = keyword.trim()
  const results = useMemo(() => searchDepartments(index, search), [index, search])
  const crumbs = departmentBreadcrumbs(scopePath)
  useEffect(() => {
    if (!departments.isSuccess) return
    if (selectedId !== "all" && selectedId !== "unassigned" && !index.has(selectedId)) onSelect("all")
  }, [departments.isSuccess, index, selectedId, onSelect])
  useEffect(() => {
    if (deletingId && (!canDelete || departments.isError || !index.has(deletingId))) setDeletingId(null)
  }, [canDelete, departments.isError, deletingId, index])
  function navigate(id: string | null) {
    if (id && !index.has(id)) return
    setScope(id ? { id, path: index.get(id)!.path.map((entry) => entry.id) } : null)
    setKeyword("")
    setCollapsed(new Set())
  }
  function locate(id: string) {
    const entry = index.get(id)
    if (!entry) return
    navigate(departmentScopeForSelection(index, id))
    setExpanded((previous) => new Set([...previous, ...entry.path.slice(0, -1).map((item) => item.id)]))
    onSelect(id)
    directoryElement.current?.focus()
  }
  function openRoot() {
    try {
      requireDirectoryPermission("department:create", session)
    } catch {
      return
    }
    setEditor({})
  }
  function action(kind: "child" | "edit" | "delete", id: string) {
    const entry = latest.current.index.get(id)
    if (!entry || latest.current.failed) return
    try {
      requireDirectoryPermission(
        kind === "child" ? "department:create" : kind === "edit" ? "department:update" : "department:delete",
        session,
      )
    } catch {
      return
    }
    if (kind === "delete") {
      setDeleteFailed(false)
      setDeletingId(id)
    } else setEditor(kind === "child" ? { parentId: id } : { department: entry.department })
  }
  async function confirmDelete() {
    if (!deletingId || deleteBusy.current) return
    if (!latest.current.index.has(deletingId) || latest.current.failed) {
      setDeletingId(null)
      return
    }
    deleteBusy.current = true
    setDeleteFailed(false)
    try {
      await writes.deletion.mutateAsync(deletingId)
      requireDirectoryPermission("department:delete", session)
      setDeletingId(null)
      toast.success(t("users.directory.deleted"))
      onChanged?.()
    } catch {
      setDeleteFailed(true)
    } finally {
      deleteBusy.current = false
    }
  }
  function rowMenu(department: DepartmentTreeNode) {
    if (!canCreate && !canEdit && !canDelete) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("users.directory.actions", { name: department.name })}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {canCreate && (
              <DropdownMenuItem onClick={() => action("child", department.id)}>
                {t("users.directory.addChild")}
              </DropdownMenuItem>
            )}
            {canEdit && (
              <DropdownMenuItem onClick={() => action("edit", department.id)}>
                {t("users.department.editTitle")}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem className="text-destructive" onClick={() => action("delete", department.id)}>
                {t("common.delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  function renderTree(nodes: DepartmentTreeNode[], depth = 0): ReactNode {
    return (
      <ul className={depth ? "ml-3 border-l pl-2" : "space-y-1"}>
        {nodes.map((department) => {
          const entry = index.get(department.id)!
          const children = department.children ?? []
          const boundary = Boolean(children.length) && isDepartmentDepthBoundary(entry.path, scopePath)
          const relativeDepth = entry.path.length - 1 - Math.max(0, scopePath.length - 1)
          const open =
            !boundary && (expanded.has(department.id) || (relativeDepth < 2 && !collapsed.has(department.id)))
          const toggle = () => {
            setExpanded((previous) => {
              const next = new Set(previous)
              if (open) next.delete(department.id)
              else next.add(department.id)
              return next
            })
            setCollapsed((previous) => {
              const next = new Set(previous)
              if (open) next.add(department.id)
              else next.delete(department.id)
              return next
            })
          }
          const Icon = department.parentId ? Folder : Building2
          return (
            <li key={department.id} className="min-w-0">
              <div className="flex min-w-0 items-center gap-1 rounded-md has-[button[aria-pressed=true]]:bg-accent">
                {children.length ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t(
                      boundary ? "users.directory.enter" : open ? "users.directory.collapse" : "users.directory.expand",
                      { name: department.name },
                    )}
                    aria-expanded={!boundary ? open : undefined}
                    onClick={() => (boundary ? navigate(department.id) : toggle())}
                  >
                    {boundary ? <CornerDownRight /> : open ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                ) : (
                  <span className="w-8 shrink-0" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="min-w-0 flex-1 justify-start px-1 text-left"
                  aria-label={t("users.directory.select", { name: department.name })}
                  aria-pressed={selectedId === department.id}
                  title={entry.path.map((item) => item.name).join(" / ")}
                  onClick={() => onSelect(department.id)}
                >
                  <Icon className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{department.name}</span>
                </Button>
                <span
                  className="shrink-0 rounded bg-muted px-1.5 text-xs tabular-nums"
                  aria-label={t("users.directory.count", { name: department.name })}
                >
                  {entry.count ?? "—"}
                </span>
                {rowMenu(department)}
              </div>
              {children.length > 0 && open && renderTree(children, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <aside className="grid min-w-0 grid-cols-1 gap-4 p-3" aria-label={t("users.directory.title")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("users.directory.title")}</h2>
        {canCreate && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("users.directory.addRoot")}
            onClick={openRoot}
          >
            <Plus />
          </Button>
        )}
      </div>
      <Input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        aria-label={t("users.directory.search")}
        placeholder={t("users.directory.search")}
      />
      <div className="grid gap-1">
        {[
          { id: "all", label: t("users.directory.allUsers"), count: members?.total },
          { id: "unassigned", label: t("users.directory.unassigned"), count: members?.unassigned },
        ].map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={selectedId === item.id ? "secondary" : "ghost"}
            className="justify-between"
            aria-pressed={selectedId === item.id}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.label}</span>
            <span className="text-xs tabular-nums">{item.count ?? "—"}</span>
          </Button>
        ))}
      </div>
      <section
        ref={directoryElement}
        tabIndex={-1}
        className="grid min-w-0 grid-cols-1 gap-3 border-t pt-3 outline-none"
        aria-label={t("users.directory.organization")}
      >
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("users.directory.organization")}</span>
          <span aria-live="polite">{t("users.directory.level", { level: Math.max(1, scopePath.length) })}</span>
        </div>
        <nav aria-label={t("users.directory.completePath")} className="grid min-w-0 grid-cols-1 gap-2">
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!scopeId}
              onClick={() => navigate(scopePath.at(-2)?.id ?? null)}
            >
              {t("users.directory.back")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("users.directory.allDepartments")}
              onClick={() => navigate(null)}
            >
              <Home />
            </Button>
          </div>
          <div className="flex min-w-0 items-center gap-1 text-xs">
            {!crumbs.length ? (
              <span className="text-muted-foreground">{t("users.directory.allDepartments")}</span>
            ) : (
              crumbs.map((department, position) => (
                <div key={department?.id ?? "ancestors"} className="flex min-w-0 items-center gap-1">
                  {position > 0 && <ChevronRight className="size-3 shrink-0" />}
                  {department ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto min-w-0 shrink px-0 text-xs"
                      aria-current={department.id === scopeId ? "location" : undefined}
                      title={scopePath.map((item) => item.name).join(" / ")}
                      onClick={() => navigate(department.id)}
                    >
                      <span className="truncate">{department.name}</span>
                    </Button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("users.directory.completePath")}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuGroup>
                          {scopePath.slice(1, -1).map((ancestor) => (
                            <DropdownMenuItem key={ancestor.id} onClick={() => navigate(ancestor.id)}>
                              {ancestor.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))
            )}
          </div>
        </nav>
        {departments.isPending ? (
          <p role="status" aria-busy="true">
            {t("common.loading")}
          </p>
        ) : departments.isError ? (
          <div className="grid gap-2">
            <p role="alert">{t("users.directory.loadFailed")}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void departments.refetch()
                void counts.refetch()
              }}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : search ? (
          <div className="grid min-w-0 gap-2">
            <p role="status" className="text-xs text-muted-foreground">
              {t("users.directory.searchResults", { count: results.length })}
            </p>
            {results.map((entry) => (
              <div key={entry.department.id} className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-w-0 flex-1 flex-col items-start gap-1 py-2 text-left"
                  aria-label={t("users.directory.locate", { name: entry.department.name })}
                  aria-pressed={selectedId === entry.department.id}
                  onClick={() => locate(entry.department.id)}
                >
                  <span className="max-w-full truncate">{entry.department.name}</span>
                  <span
                    className="max-w-full truncate text-xs font-normal text-muted-foreground"
                    title={entry.path.map((item) => item.name).join(" / ")}
                  >
                    {entry.path
                      .slice(0, -1)
                      .map((item) => item.name)
                      .join(" / ") || t("users.directory.allDepartments")}
                  </span>
                </Button>
                <span
                  className="text-xs tabular-nums"
                  aria-label={t("users.directory.count", { name: entry.department.name })}
                >
                  {entry.count ?? "—"}
                </span>
              </div>
            ))}
            {!results.length && (
              <div className="grid gap-2">
                <p role="status" className="text-sm text-muted-foreground">
                  {t("users.directory.noResults")}
                </p>
                <Button type="button" variant="ghost" onClick={() => setKeyword("")}>
                  {t("users.directory.clearSearch")}
                </Button>
              </div>
            )}
          </div>
        ) : roots.length ? (
          <div aria-busy={departments.isFetching}>{renderTree(roots)}</div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {t("users.directory.empty")}
          </p>
        )}
      </section>
      {editor && (
        <DepartmentOperateDrawer
          open
          {...editor}
          onOpenChange={(open) => {
            if (!open) setEditor(null)
          }}
          onSuccess={() => onChanged?.()}
        />
      )}
      <ConfirmActionDialog
        open={Boolean(deletingId) && canDelete}
        onOpenChange={(open) => {
          if (!open && !deleteBusy.current) setDeletingId(null)
        }}
        title={t("users.directory.deleteTitle")}
        description={t(deleteFailed ? "users.directory.deleteFailedDescription" : "users.directory.deleteDescription", {
          name: deletingId ? (index.get(deletingId)?.department.name ?? "—") : "—",
        })}
        pending={writes.deletion.isPending}
        onConfirm={() => void confirmDelete()}
        confirmLabel={t("common.delete")}
      />
    </aside>
  )
}
