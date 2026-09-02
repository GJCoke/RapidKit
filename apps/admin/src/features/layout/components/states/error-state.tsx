import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"

export function ErrorState({
  message,
  onRetry,
  retryLabel,
}: {
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-muted-foreground">
      <TriangleAlert className="size-8 text-destructive" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel ?? t("state.retry")}
        </Button>
      )}
    </div>
  )
}
