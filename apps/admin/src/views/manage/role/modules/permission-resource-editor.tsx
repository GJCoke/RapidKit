import { useId } from "react"
import {
  Badge,
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rapidkit/ui"
import { useTranslation } from "react-i18next"
import type { PermissionCatalog, PermissionPackage } from "@/services/api/role"
import type { RoleGrant } from "./package-apply-diff"
import { applyPermissionSelection, matchingResourcePackage, packagesForResource } from "./permission-draft"
import { expandImpliedCodes, toggleCode, type PermissionMatrixRow } from "./permission-matrix"
import {
  dataScopeOptions,
  fieldModeOptions,
  getDataScope,
  getFieldMode,
  hasScopeControls,
  invalidScopeKey,
  setDataScope,
  setFieldMode,
} from "./resource-scope"

export function ScopeSelect({
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  label: string
  value: string
  items: { label: string; value: string }[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm">
      <span>{label}</span>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) onChange(next)
        }}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  )
}
export function PermissionResourceEditor({
  row,
  catalog,
  packages,
  draft,
  onChange,
  disabled,
  invalidKeys,
  query = "",
  onFocusResource,
}: {
  row: PermissionMatrixRow
  catalog: PermissionCatalog
  packages: PermissionPackage[]
  draft: RoleGrant
  onChange: (grant: RoleGrant) => void
  disabled: boolean
  invalidKeys: Set<string>
  query?: string
  onFocusResource: (resource: string) => void
}) {
  const { t } = useTranslation()
  const labelId = useId()
  const direct = new Set(draft.permissionCodes),
    implied = new Set(expandImpliedCodes(draft.permissionCodes, catalog))
  const effective = (code: string) => direct.has(code) || implied.has(code)
  const resources = packagesForResource(packages, row.resource.key)
  const match = matchingResourcePackage(draft.permissionCodes, row.resource.key, resources)
  const labels = new Map(catalog.codes.map((c) => [c.code, c.label]))
  const dependencies = expandImpliedCodes(
    draft.permissionCodes.filter((c) => row.codes.some((item) => item.code === c)),
    catalog,
  ).filter((c) => !row.codes.some((item) => item.code === c))
  const active = row.codes.some((c) => effective(c.code))
  const all = row.codes.every((c) => effective(c.code))
  const fieldLabels = {
    visible: t("role.fieldMode.visible"),
    masked: t("role.fieldMode.masked"),
    hidden: t("role.fieldMode.hidden"),
  }
  return (
    <section
      data-resource-key={row.resource.key}
      aria-label={row.resource.label}
      className="grid min-w-0 gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{row.resource.label}</h3>
        <Badge variant="secondary">
          {match ? t("role.workbench.match", { name: match.label }) : t("role.workbench.custom")}
        </Badge>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          aria-labelledby={`${labelId}-all`}
          checked={all}
          indeterminate={active && !all}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({
              ...draft,
              permissionCodes: applyPermissionSelection(draft.permissionCodes, row.codes, checked ? "all" : "clear"),
            })
          }
        />
        <span id={`${labelId}-all`}>
          {row.resource.label} / {t("role.workbench.resourceAll")}
        </span>
      </label>
      {!!resources.length && (
        <div className="grid gap-2 rounded-md bg-muted p-3">
          <p className="text-sm font-medium">{t("role.workbench.packages")}</p>
          <div className="flex flex-wrap gap-3">
            {resources.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  aria-labelledby={`${labelId}-${item.key}`}
                  checked={item.codes.every((c) => direct.has(c))}
                  indeterminate={item.codes.some((c) => direct.has(c)) && !item.codes.every((c) => direct.has(c))}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...draft,
                      permissionCodes: checked
                        ? [...new Set([...draft.permissionCodes, ...item.codes])]
                        : draft.permissionCodes.filter((c) => !item.codes.includes(c)),
                    })
                  }
                />
                <span id={`${labelId}-${item.key}`}>{item.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("role.workbench.packageHint")}</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {row.codes
          .filter((c) => `${c.label} ${c.code}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
          .map((item) => (
            <div key={item.code} className="grid gap-1 text-sm">
              <label className="flex items-start gap-2">
                <Checkbox
                  aria-labelledby={`${labelId}-${item.code}`}
                  checked={effective(item.code)}
                  disabled={disabled || (!direct.has(item.code) && implied.has(item.code))}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...draft,
                      permissionCodes: toggleCode(draft.permissionCodes, item.code, checked === true),
                    })
                  }
                />
                <span>
                  <span id={`${labelId}-${item.code}`}>{item.label}</span>
                  <code className="block break-all text-xs text-muted-foreground">{item.code}</code>
                </span>
              </label>
              {!direct.has(item.code) && implied.has(item.code) && (
                <details className="pl-6 text-xs text-muted-foreground">
                  <summary>{t("role.implied")}</summary>
                  {t("role.workbench.requiredBy", {
                    names: draft.permissionCodes
                      .filter((c) => expandImpliedCodes([c], catalog).includes(item.code))
                      .map((c) => labels.get(c) ?? c)
                      .join(", "),
                  })}
                </details>
              )}
            </div>
          ))}
      </div>
      {!!dependencies.length && (
        <div className="grid gap-1 text-xs">
          <p>{t("role.workbench.crossDependencies")}</p>
          <div className="flex flex-wrap gap-1">
            {dependencies.map((code) => (
              <Button
                key={code}
                size="sm"
                variant="outline"
                onClick={() =>
                  onFocusResource(catalog.codes.find((c) => c.code === code)?.resource ?? code.split(":")[0])
                }
              >
                {labels.get(code) ?? code}
              </Button>
            ))}
          </div>
        </div>
      )}
      {hasScopeControls(row.resource) ? (
        <div className="grid gap-3 border-t pt-3">
          <h4 className="text-sm font-medium">{t("role.workbench.restrictions")}</h4>
          {!active && <p className="text-xs text-muted-foreground">{t("role.workbench.inactiveRestrictions")}</p>}
          {!!row.resource.dataScopes.length && (
            <ScopeSelect
              label={`${row.resource.label} / ${t("role.dataScope")}`}
              value={getDataScope(draft.dataScopes, row.resource.key)}
              items={dataScopeOptions(row.resource, t("role.dataScopeAll"))}
              disabled={disabled || !active || invalidKeys.has(row.resource.key)}
              onChange={(value) =>
                onChange({ ...draft, dataScopes: setDataScope(draft.dataScopes, row.resource.key, value) })
              }
            />
          )}
          {row.resource.fieldGroups.map((group) => (
            <ScopeSelect
              key={group.key}
              label={`${row.resource.label} / ${group.label}`}
              value={getFieldMode(draft.fieldModes, row.resource.key, group.key)}
              items={fieldModeOptions(group, fieldLabels)}
              disabled={disabled || !active || invalidKeys.has(invalidScopeKey(row.resource.key, group.key))}
              onChange={(value) => {
                const mode = fieldModeOptions(group, fieldLabels).find((m) => m.value === value)?.value
                if (mode)
                  onChange({ ...draft, fieldModes: setFieldMode(draft.fieldModes, row.resource.key, group.key, mode) })
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("role.workbench.noRestrictionOptions")}</p>
      )}
      {!!resources.length && <p className="text-xs text-muted-foreground">{t("role.workbench.matchHint")}</p>}
    </section>
  )
}
