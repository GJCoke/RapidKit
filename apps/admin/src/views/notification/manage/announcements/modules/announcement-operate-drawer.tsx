import { useEffect, useState } from "react"
import { Controller } from "react-hook-form"
import { useTranslation } from "react-i18next"
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@rapidkit/ui"
import { FormField } from "@/shared/crud"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { AnnouncementContentFields } from "./announcement-content-fields"
import { AnnouncementAudienceEditor } from "./announcement-audience-editor"
import { AnnouncementActionEditor } from "./announcement-action-editor"
import { AnnouncementSelect } from "./announcement-select"
import { AnnouncementPreviewPanel } from "./announcement-preview-panel"
import { BannerSummary } from "./banner-summary"
import { useAnnouncementEditor } from "./use-announcement-editor"
import { useAnnouncementPreviews } from "./use-announcement-previews"
import type { AnnouncementLocale } from "./announcement-model"
export function AnnouncementOperateDrawer({
  messageId,
  copyFromId,
  onClose,
}: {
  messageId?: string | null
  copyFromId?: string | null
  onClose: () => void
}) {
  const { t } = useTranslation(),
    editor = useAnnouncementEditor({ messageId, copyFromId, onClose })
  const { form, values, disabled, processing, registeredBanner } = editor
  const previews = useAnnouncementPreviews(form, values, editor.selectedTemplate, editor.session, disabled)
  const [locale, setLocale] = useState<AnnouncementLocale>("zh-CN")
  useEffect(() => {
    if (editor.initialized) setLocale(form.getValues("localized.defaultLocale"))
  }, [editor.initialized, form])
  const banner = values.displayMode === "top_banner"
  const audience =
    values.audienceMode === "all" || banner
      ? t("announcement.editor.allUsers")
      : t("announcement.editor.selectedAudience", { count: values.audiences.length })
  const delivery =
    values.delivery === "now"
      ? t(`announcement.${banner ? "banner.now" : "editor.now"}`)
      : values.publishAt || t("announcement.editor.scheduleUnset")
  const confirmationLabel = banner
    ? t(
        `announcement.banner.${values.delivery === "scheduled" ? "confirmSchedule" : editor.confirmation?.check?.current ? "confirmReplace" : "confirmPublish"}`,
      )
    : t(`announcement.editor.${values.delivery === "scheduled" ? "confirmSchedule" : "confirmPublish"}`)
  const title = t(`announcement.${copyFromId ? "copy" : messageId ? "edit" : "add"}`)
  const total = previews.audienceTotal ?? null
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !processing) onClose()
        }}
      >
        <SheetContent
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-[840px]"
          showCloseButton={!processing}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {t(`announcement.${banner ? "banner.editorSubtitle" : "editor.subtitle"}`)}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {!editor.initialized ? (
              editor.detail.isError ? (
                <ErrorState
                  message={t("announcement.editor.loadFailed")}
                  onRetry={() => void editor.detail.refetch()}
                />
              ) : (
                <LoadingState label={t("common.loading")} />
              )
            ) : (
              <form className="grid min-w-0 gap-6" onSubmit={editor.saveDraft}>
                <FormField
                  label={t("announcement.banner.displayMode")}
                  description={t(`announcement.banner.${banner ? "modeHint" : "inboxHint"}`)}
                >
                  <Controller
                    control={form.control}
                    name="displayMode"
                    render={({ field }) => (
                      <AnnouncementSelect
                        label={t("announcement.banner.displayMode")}
                        value={field.value}
                        options={[
                          { value: "inbox", label: t("announcement.editor.inApp") },
                          { value: "top_banner", label: t("announcement.banner.topBanner") },
                        ]}
                        disabled={disabled || registeredBanner}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  {registeredBanner && (
                    <p className="text-xs text-muted-foreground">{t("announcement.banner.scheduledEditHint")}</p>
                  )}
                </FormField>
                <AnnouncementContentFields editor={editor} onLocaleChange={setLocale} />
                <AnnouncementPreviewPanel
                  editor={editor}
                  previews={previews}
                  locale={locale}
                  onLocaleChange={setLocale}
                />
                {!banner && (
                  <section className="grid min-w-0 gap-4 border-t pt-4">
                    <div>
                      <h2 className="font-semibold">{t("announcement.editor.audienceHeading")}</h2>
                      <p className="text-xs text-muted-foreground">{t("announcement.editor.audienceHint")}</p>
                    </div>
                    <RadioGroup
                      value={values.audienceMode}
                      aria-label={t("announcement.editor.audienceScope")}
                      disabled={disabled}
                      onValueChange={(value) => {
                        if (value === "all" || value === "selected")
                          form.setValue("audienceMode", value, { shouldDirty: true })
                      }}
                    >
                      {(["all", "selected"] as const).map((value) => (
                        <label key={value} className="flex items-start gap-2 text-sm">
                          <RadioGroupItem value={value} />
                          <span>
                            {t(`announcement.editor.${value === "all" ? "allUsers" : "selectedUsers"}`)}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t(`announcement.editor.${value === "all" ? "allUsersHint" : "selectedUsersHint"}`)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                    {values.audienceMode === "selected" && (
                      <AnnouncementAudienceEditor
                        form={form}
                        values={values}
                        directories={previews.directories}
                        disabled={disabled}
                      />
                    )}
                    {previews.canPreview && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled || previews.audienceLoading}
                        onClick={() => void previews.previewAudience()}
                      >
                        {previews.audienceLoading ? t("common.loading") : t("announcement.editor.previewAudience")}
                      </Button>
                    )}
                    <p aria-live="polite" className="text-sm">
                      {total === null
                        ? t("announcement.editor.audienceUnchecked")
                        : t("announcement.editor.audienceCount", { count: total })}
                    </p>
                    {total !== null && (
                      <p className="text-xs text-muted-foreground">{t("announcement.editor.audienceEstimate")}</p>
                    )}
                    {previews.audienceError && (
                      <p role="alert" className="text-sm text-destructive">
                        {previews.audienceError}
                      </p>
                    )}
                  </section>
                )}
                <section className="grid min-w-0 gap-4 border-t pt-4">
                  <div>
                    <h2 className="font-semibold">
                      {t(`announcement.${banner ? "banner.timeHeading" : "editor.timeHeading"}`)}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t(`announcement.${banner ? "banner.timeHint" : "editor.timeHint"}`)}
                    </p>
                  </div>
                  <RadioGroup
                    value={values.delivery}
                    disabled={disabled}
                    aria-label={t("announcement.editor.delivery")}
                    onValueChange={(value) => {
                      if (value === "now" || value === "scheduled")
                        form.setValue("delivery", value, { shouldDirty: true })
                    }}
                    className="flex flex-wrap gap-4"
                  >
                    {(["now", "scheduled"] as const).map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {t(`announcement.${banner ? "banner" : "editor"}.${value === "now" ? "now" : "timed"}`)}
                      </label>
                    ))}
                  </RadioGroup>
                  {values.delivery === "scheduled" && (
                    <FormField
                      label={t("announcement.editor.publishAt")}
                      description={t(`announcement.${banner ? "banner" : "editor"}.scheduleHint`, {
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      })}
                    >
                      <Input
                        type="datetime-local"
                        step="1"
                        aria-label={t("announcement.editor.publishAt")}
                        disabled={disabled}
                        {...form.register("publishAt")}
                      />
                    </FormField>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!values.expires}
                      disabled={disabled}
                      onCheckedChange={(checked) => form.setValue("expires", checked !== true, { shouldDirty: true })}
                    />
                    {t("announcement.editor.forever")}
                  </label>
                  {values.expires && (
                    <FormField label={t("announcement.editor.expires")}>
                      <Input
                        type="datetime-local"
                        step="1"
                        aria-label={t("announcement.editor.expires")}
                        disabled={disabled}
                        {...form.register("expireAt")}
                      />
                    </FormField>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t(`announcement.${banner ? "banner" : "editor"}.expireHint`)}
                  </p>
                  {!banner && (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={values.mandatory}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            form.setValue("mandatory", checked === true, { shouldDirty: true })
                          }
                        />
                        {t("announcement.editor.mandatory")}
                      </label>
                      <p className="text-xs text-muted-foreground">{t("announcement.editor.mandatoryHint")}</p>
                      {["admin.announcement", "system.security"].includes(values.category) && (
                        <p className="text-xs text-muted-foreground">{t("announcement.editor.reservedHint")}</p>
                      )}
                    </>
                  )}
                </section>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">{t("announcement.editor.advanced")}</summary>
                  <div className="mt-4 grid min-w-0 gap-4">
                    {!banner && (
                      <FormField
                        label={t("announcement.editor.category")}
                        required
                        description={t("announcement.editor.categoryHint")}
                      >
                        <Input
                          aria-label={t("announcement.editor.category")}
                          list="announcement-categories"
                          disabled={disabled}
                          {...form.register("category")}
                        />
                        <datalist id="announcement-categories">
                          {[
                            "admin.announcement",
                            "system.security",
                            "user.invited",
                            "user.mention",
                            "task.completed",
                          ].map((category) => (
                            <option key={category} value={category} />
                          ))}
                        </datalist>
                      </FormField>
                    )}
                    {values.contentSource === "raw" && (
                      <FormField label={t("announcement.editor.format")}>
                        <Controller
                          control={form.control}
                          name="rawFormat"
                          render={({ field }) => (
                            <AnnouncementSelect
                              label={t("announcement.editor.format")}
                              value={field.value}
                              options={[
                                { value: "plain_text", label: t("announcement.editor.plainText") },
                                { value: "markdown", label: "Markdown" },
                              ]}
                              disabled={disabled}
                              onChange={field.onChange}
                            />
                          )}
                        />
                      </FormField>
                    )}
                    <AnnouncementActionEditor
                      form={form}
                      values={values}
                      targets={editor.actionTargets}
                      target={editor.actionTarget}
                      disabled={disabled}
                    />
                  </div>
                </details>
                {editor.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {editor.error}
                  </p>
                )}
              </form>
            )}
          </div>
          <SheetFooter className="grid gap-2 border-t">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="secondary">{t(`announcement.editor.savedStates.${editor.savedStatus}`)}</Badge>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={processing} onClick={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || !editor.canSave || registeredBanner}
                  onClick={() => void editor.saveDraft()}
                >
                  {processing && !editor.confirmation ? t("common.loading") : t("announcement.editor.saveDraft")}
                </Button>
                {editor.canPublish && (
                  <Button type="button" disabled={disabled} onClick={() => void editor.preparePublish()}>
                    {editor.preparing
                      ? t("common.loading")
                      : t(
                          `announcement.editor.${values.delivery === "scheduled" ? "confirmSchedule" : "confirmPublish"}`,
                        )}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("announcement.editor.draftHint")} · {audience} · {delivery}
            </p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Dialog
        open={Boolean(editor.confirmation)}
        onOpenChange={(open) => {
          if (!open && !processing) editor.setConfirmation(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!processing}>
          <DialogHeader>
            <DialogTitle>{t("announcement.editor.confirmationTitle")}</DialogTitle>
            <DialogDescription>
              {audience} · {delivery}
            </DialogDescription>
          </DialogHeader>
          <AnnouncementPreviewPanel
            editor={editor}
            previews={previews}
            locale={locale}
            onLocaleChange={setLocale}
            confirmation
          />
          {banner && editor.confirmation?.check && (
            <BannerSummary
              check={editor.confirmation.check}
              delivery={values.delivery}
              messageId={messageId}
              confirmation
            />
          )}
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("announcement.editor.audienceScope")}</dt>
              <dd>{audience}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("announcement.editor.expires")}</dt>
              <dd>{values.expires ? values.expireAt : t("announcement.editor.forever")}</dd>
            </div>
          </dl>
          {!banner && (
            <p className="text-sm">
              {total === null
                ? t("announcement.editor.confirmUnchecked")
                : t("announcement.editor.audienceCount", { count: total })}
            </p>
          )}
          {editor.error && (
            <p role="alert" className="text-sm text-destructive">
              {editor.error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={processing} onClick={() => editor.setConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={processing || !editor.canPublish}
              onClick={() => void editor.confirmPublish()}
            >
              {processing ? t("common.loading") : confirmationLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
