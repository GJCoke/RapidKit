import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@rapidkit/ui"
import { useTranslation } from "react-i18next"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  pending?: boolean
  confirmLabel?: string
}
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  pending,
  confirmLabel,
}: Props) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button variant="outline" disabled={pending} />}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction render={<Button variant="destructive" disabled={pending} onClick={onConfirm} />}>
            {pending ? t("form.processing") : (confirmLabel ?? t("form.confirm"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
