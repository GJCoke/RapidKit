import { useTranslation } from "react-i18next"
import { Badge } from "@rapidkit/ui"
import type { PermissionCatalog } from "@/services/api/role"
import type { PermissionDraftDiff } from "./permission-draft"
import type { PermissionModule } from "./permission-menu-groups"
import type { InvalidScope } from "./resource-scope"

export function PermissionChangeReview({
  diff,
  catalog,
  modules,
  repairs,
}: {
  diff: PermissionDraftDiff
  catalog: PermissionCatalog
  modules: PermissionModule[]
  repairs: InvalidScope[]
}) {
  const { t } = useTranslation()
  const labels = new Map(catalog.codes.map((c) => [c.code, c.label]))
  const owners = new Map(
    modules.flatMap((m) => m.entries.filter((e) => e.ownerKey === m.key).map((e) => [e.row.resource.key, m.key])),
  )
  const owner = (resource: string) => owners.get(resource) ?? "other"
  const candidates = modules.some((m) => m.key === "other")
    ? modules
    : [...modules, { key: "other", label: t("role.workbench.otherResources"), entries: [] }]
  const modeLabels: Record<string, string> = {
    visible: t("role.fieldMode.visible"),
    masked: t("role.fieldMode.masked"),
    hidden: t("role.fieldMode.hidden"),
  }
  const scopeLabel = (key: string, group: string | null | undefined, value: string) =>
    group
      ? (modeLabels[value] ?? value)
      : value === "all"
        ? t("role.dataScopeAll")
        : (catalog.resources.find((r) => r.key === key)?.dataScopes.find((s) => s.key === value)?.label ?? value)
  const target = (key: string, group?: string | null) => {
    const resource = catalog.resources.find((r) => r.key === key)
    return [resource?.label ?? key, group ? (resource?.fieldGroups.find((g) => g.key === group)?.label ?? group) : ""]
      .filter(Boolean)
      .join(" / ")
  }
  return (
    <div className="grid gap-4" aria-live="polite">
      {candidates.map((m) => {
        const groups = (["addedCodes", "removedCodes", "addedImplied", "removedImplied"] as const).map((key) => ({
          key,
          codes: diff[key].filter(
            (code) => owner(catalog.codes.find((c) => c.code === code)?.resource ?? code.split(":")[0]) === m.key,
          ),
        }))
        const scopes = diff.scopeChanges.filter((s) => owner(s.resource) === m.key),
          fixed = repairs.filter((s) => owner(s.resource) === m.key)
        if (!groups.some((g) => g.codes.length) && !scopes.length && !fixed.length) return null
        return (
          <section key={m.key} data-review-module={m.key} className="grid gap-3 rounded-lg border p-4">
            <h4 className="font-semibold">{m.label}</h4>
            {groups.map((g) => (
              <div key={g.key} className="grid gap-2">
                <h5 className="text-sm font-medium">
                  {t(`role.workbench.${g.key}`)} · {g.codes.length}
                </h5>
                {g.codes.length ? (
                  <div className="flex flex-wrap gap-1">
                    {g.codes.map((code) => (
                      <Badge key={code} variant={g.key.startsWith("removed") ? "destructive" : "secondary"}>
                        {labels.get(code) ?? code}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("role.workbench.noChanges")}</p>
                )}
              </div>
            ))}
            <h5 className="text-sm font-medium">{t("role.workbench.restrictions")}</h5>
            {scopes.length ? (
              scopes.map((s) => (
                <p className="break-words text-sm" key={`${s.resource}.${s.group}`}>
                  {target(s.resource, s.group)}: {scopeLabel(s.resource, s.group, s.before)} →{" "}
                  {scopeLabel(s.resource, s.group, s.after)}
                </p>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">{t("role.workbench.keepRestrictions")}</p>
            )}
            {!!fixed.length && (
              <div role="alert" className="grid gap-2 border-t pt-3">
                <p>{t("role.workbench.repairSummary")}</p>
                {fixed.map((s) => (
                  <p className="break-words text-sm" key={`${s.resource}.${s.group}`}>
                    {target(s.resource, s.group)}: {s.stored} → {s.effective}
                  </p>
                ))}
              </div>
            )}
          </section>
        )
      })}
      <p className="text-xs text-muted-foreground">{t("role.workbench.oneTimeHint")}</p>
    </div>
  )
}
