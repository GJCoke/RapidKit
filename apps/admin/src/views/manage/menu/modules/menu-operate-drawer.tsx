import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  Button,
  Checkbox,
  FieldGroup,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@rapidkit/ui"
import { useState } from "react"
import type { Menu } from "@/services/api/menu"
import { fetchActiveMenuOptions, fetchMenuPages } from "@/services/api/menu"
import { fetchPermissionCatalog } from "@/services/api/role"
import { getAuthSession } from "@/services/auth-session"
import { menuQueryKeys, requireMenuPermission, unwrapMenuRequest, useMenuMutations } from "@/services/hooks/use-menus"
import { resolveMenuIcon } from "@/features/layout/components/sidebar/sidebar-icon"
import { CrudDrawer, FormField } from "@/shared/crud"
import { createMenuValues, menuBody, routeNameChanged, type MenuOperation, type MenuValues } from "./menu-form"

function MenuSelect({
  label,
  value,
  items,
  onChange,
  disabled,
  error,
  required,
}: {
  label: string
  value: string
  items: Array<{ value: string; label: string; disabled?: boolean }>
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
  required?: boolean
}) {
  const { t } = useTranslation()
  const options = [{ value: "", label: t("menu.unset") }, ...items]
  if (value && !options.some((item) => item.value === value)) options.push({ value, label: value })
  return (
    <FormField label={label} error={error} required={required}>
      <Select items={options} value={value} onValueChange={(v) => onChange(v ?? "")} disabled={disabled}>
        <SelectTrigger aria-label={label} aria-invalid={!!error}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((item) => (
              <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </FormField>
  )
}
const localIcons = [
  "activity",
  "at-sign",
  "avatar",
  "banner",
  "cast",
  "chrome",
  "copy",
  "custom-icon",
  "empty-data",
  "heart",
  "incognito",
  "logo",
  "logo-loading",
  "network-error",
  "no-icon",
  "no-permission",
  "not-found",
  "service-error",
  "wind",
]
export function MenuOperateDrawer({
  operation,
  menu,
  onClose,
}: {
  operation: MenuOperation
  menu: Menu | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [session] = useState(getAuthSession)
  const [permissionSearch, setPermissionSearch] = useState("")
  const form = useForm<MenuValues>({ defaultValues: createMenuValues(operation, menu) })
  const values = useWatch({ control: form.control })
  const queryFields = useFieldArray({ control: form.control, name: "query" })
  const mutations = useMenuMutations()
  const pending = mutations.create.isPending || mutations.update.isPending
  const pages = useQuery({
    queryKey: [...menuQueryKeys.all(session), "pages"],
    queryFn: () => unwrapMenuRequest(fetchMenuPages()),
    retry: false,
  })
  const catalog = useQuery({
    queryKey: ["menu-permission-catalog", session],
    queryFn: () => unwrapMenuRequest(fetchPermissionCatalog()),
    retry: false,
  })
  const active = useQuery({
    queryKey: [...menuQueryKeys.all(session), "active", values.parentId, values.constant],
    queryFn: () => unwrapMenuRequest(fetchActiveMenuOptions(values.parentId!, values.constant === true)),
    enabled: !!values.parentId,
    retry: false,
    staleTime: 0,
  })
  const PreviewIcon = resolveMenuIcon(values.iconType === "2" ? { localIcon: values.icon } : { icon: values.icon })
  const showPermission = values.menuType === "2" && !values.constant
  const submit = form.handleSubmit(async (data) => {
    try {
      requireMenuPermission(operation === "edit" ? "menu:update" : "menu:create", session)
      if (operation === "edit" && menu) await mutations.update.mutateAsync({ id: menu.id, data: menuBody(data) })
      else await mutations.create.mutateAsync(menuBody(data))
      if (session !== getAuthSession()) return
      toast.success(t("menu.saved"))
      onClose()
    } catch {
      /* request layer displays errors and retains the draft */
    }
  })
  const required = { validate: (value: string) => !!value.trim() || t("menu.required") }
  const textFields = ["menuName", "routeName", "routePath", "pathParam", "i18nKey", "href"] as const
  return (
    <CrudDrawer
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      title={t(
        operation === "edit" ? "menu.editMenu" : operation === "addChild" ? "menu.addChildMenu" : "menu.addMenu",
      )}
      description={t("menu.description")}
      submitting={pending}
      onSubmit={() => void submit()}
    >
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <FieldGroup>
            <Controller
              control={form.control}
              name="menuType"
              render={({ field }) => (
                <MenuSelect
                  label={t("menu.menuType")}
                  value={field.value}
                  disabled={pending || operation === "edit"}
                  items={[
                    { value: "1", label: t("menu.type.directory") },
                    { value: "2", label: t("menu.type.menu") },
                  ]}
                  onChange={(value) => {
                    if (value === "1" || value === "2") field.onChange(value)
                  }}
                />
              )}
            />
            {textFields.map((name) => (
              <FormField
                key={name}
                htmlFor={`menu-${name}`}
                label={t(`menu.${name}`)}
                required={["menuName", "routeName", "routePath"].includes(name)}
                error={form.formState.errors[name]?.message}
              >
                <Input
                  id={`menu-${name}`}
                  disabled={pending || name === "routePath"}
                  aria-invalid={!!form.formState.errors[name]}
                  {...form.register(name, ["menuName", "routeName", "routePath"].includes(name) ? required : undefined)}
                  onChange={(event) => {
                    void form.register(name).onChange(event)
                    if (name === "routeName")
                      for (const [key, value] of Object.entries(routeNameChanged(event.target.value)))
                        if (key === "routePath" || key === "i18nKey")
                          form.setValue(key, value, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })
                  }}
                />
              </FormField>
            ))}
            {!values.parentId && (
              <Controller
                control={form.control}
                name="layout"
                render={({ field }) => (
                  <MenuSelect
                    label={t("menu.layout")}
                    value={field.value}
                    disabled={pending}
                    onChange={field.onChange}
                    items={[
                      { value: "base", label: "base" },
                      { value: "blank", label: "blank" },
                    ]}
                  />
                )}
              />
            )}
            {values.menuType === "2" && (
              <Controller
                control={form.control}
                name="page"
                render={({ field }) => (
                  <MenuSelect
                    label={t("menu.page")}
                    value={field.value}
                    disabled={pending || pages.isLoading || pages.isError}
                    onChange={field.onChange}
                    items={[...new Set([...(pages.data ?? []), ...(values.routeName ? [values.routeName] : [])])].map(
                      (value) => ({ value, label: value }),
                    )}
                  />
                )}
              />
            )}
            {showPermission && (
              <>
                <FormField htmlFor="menu-permission-search" label={t("menu.searchPermissions")}>
                  <Input
                    id="menu-permission-search"
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                  />
                </FormField>
                <Controller
                  control={form.control}
                  name="permission"
                  rules={{
                    validate: (value) =>
                      form.getValues("menuType") !== "2" ||
                      form.getValues("constant") ||
                      !!value ||
                      t("menu.form.permission"),
                  }}
                  render={({ field }) => (
                    <MenuSelect
                      label={t("menu.permission")}
                      value={field.value}
                      required
                      error={form.formState.errors.permission?.message}
                      disabled={pending || catalog.isLoading || catalog.isError}
                      onChange={field.onChange}
                      items={(catalog.data?.codes ?? [])
                        .filter((code) =>
                          `${code.code} ${code.label}`.toLowerCase().includes(permissionSearch.toLowerCase()),
                        )
                        .map((code) => ({
                          value: code.code,
                          label: `${catalog.data?.resources.find((r) => r.key === code.resource)?.label ?? code.resource} · ${code.label} (${code.code})`,
                        }))}
                    />
                  )}
                />
              </>
            )}
            {[pages, catalog, ...(values.parentId ? [active] : [])].map(
              (query, index) =>
                query.isError && (
                  <div key={index} role="alert" className="flex items-center gap-2 text-destructive">
                    <span>{t("menu.optionsFailed")}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
                      {t("menu.retry")}
                    </Button>
                  </div>
                ),
            )}
            {(["order", "fixedIndexInTab"] as const).map((name) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                rules={{ validate: (value) => value === null || Number.isInteger(value) || t("menu.required") }}
                render={({ field }) => (
                  <FormField
                    label={t(`menu.${name}`)}
                    htmlFor={`menu-${name}`}
                    error={form.formState.errors[name]?.message}
                  >
                    <Input
                      id={`menu-${name}`}
                      type="number"
                      step="1"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? (name === "order" ? 0 : null) : Number(e.target.value))
                      }
                    />
                  </FormField>
                )}
              />
            ))}
            <Controller
              control={form.control}
              name="iconType"
              render={({ field }) => (
                <MenuSelect
                  label={t("menu.iconTypeTitle")}
                  value={field.value}
                  disabled={pending}
                  onChange={(v) => {
                    if (v === "1" || v === "2") field.onChange(v)
                  }}
                  items={[
                    { value: "1", label: t("menu.iconType.iconify") },
                    { value: "2", label: t("menu.iconType.local") },
                  ]}
                />
              )}
            />
            {values.iconType === "2" ? (
              <Controller
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <MenuSelect
                    label={t("menu.icon")}
                    value={field.value}
                    disabled={pending}
                    onChange={field.onChange}
                    items={localIcons.map((value) => ({ value, label: value }))}
                  />
                )}
              />
            ) : (
              <FormField htmlFor="menu-icon" label={t("menu.icon")}>
                <Input id="menu-icon" {...form.register("icon")} />
              </FormField>
            )}
            {values.icon && (
              <span title={values.icon}>
                <PreviewIcon className="size-5" aria-label={values.icon} />
              </span>
            )}
            <Controller
              control={form.control}
              name="status"
              rules={{ required: t("menu.required") }}
              render={({ field }) => (
                <MenuSelect
                  label={t("menu.menuStatus")}
                  value={field.value}
                  required
                  error={form.formState.errors.status?.message}
                  disabled={pending}
                  onChange={(v) => {
                    if (v === "1" || v === "2") field.onChange(v)
                  }}
                  items={[
                    { value: "1", label: t("menu.enabled") },
                    { value: "2", label: t("menu.disabled") },
                    ...(menu?.status === "3"
                      ? [{ value: "3", label: t("menu.otherStatus", { status: "3" }), disabled: true }]
                      : []),
                  ]}
                />
              )}
            />
            {(["keepAlive", "constant", "hideInMenu", "multiTab"] as const).map((name) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormField htmlFor={`menu-${name}`} label={t(`menu.${name}`)}>
                    <Checkbox
                      id={`menu-${name}`}
                      aria-label={t(`menu.${name}`)}
                      checked={field.value}
                      disabled={pending}
                      onCheckedChange={(v) => {
                        field.onChange(v === true)
                        if (name === "constant" || (name === "hideInMenu" && !v))
                          form.setValue("activeMenu", "", { shouldDirty: true })
                      }}
                    />
                  </FormField>
                )}
              />
            ))}
            {values.hideInMenu && (
              <Controller
                control={form.control}
                name="activeMenu"
                render={({ field }) => (
                  <MenuSelect
                    label={t("menu.activeMenu")}
                    value={field.value}
                    disabled={pending || active.isLoading || active.isError}
                    onChange={field.onChange}
                    items={(active.isError ? [] : (active.data ?? [])).map((item) => ({
                      value: item.routeName,
                      label: `${item.menuName} (${item.routeName})`,
                    }))}
                  />
                )}
              />
            )}
            <FormField label={t("menu.query")}>
              <div className="grid gap-2">
                {queryFields.fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <Input
                      aria-label={`${t("menu.form.queryKey")} ${index + 1}`}
                      {...form.register(`query.${index}.key`)}
                    />
                    <Input
                      aria-label={`${t("menu.form.queryValue")} ${index + 1}`}
                      {...form.register(`query.${index}.value`)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={t("menu.removeQuery", { index: index + 1 })}
                      onClick={() => queryFields.remove(index)}
                    >
                      −
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => queryFields.append({ key: "", value: "" })}>
                  {t("menu.addQuery")}
                </Button>
              </div>
            </FormField>
          </FieldGroup>
        </fieldset>
      </form>
    </CrudDrawer>
  )
}
