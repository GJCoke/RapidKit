import type { ReactNode } from "react"
import { Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@rapidkit/ui"
import { useTranslation } from "react-i18next"

interface CrudDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
  submitting?: boolean
  onSubmit: () => void
  submitLabel?: string
  cancelLabel?: string
}

export function CrudDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  submitting,
  onSubmit,
  submitLabel,
  cancelLabel,
}: CrudDrawerProps) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">{children}</div>
        <SheetFooter className="border-t">
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button disabled={submitting} onClick={onSubmit}>
            {submitting ? t("form.submitting") : (submitLabel ?? t("common.save"))}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
