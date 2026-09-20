import { cn } from "@rapidkit/ui/lib/utils"
import type { LayoutMode } from "../theme-config"

export function LayoutModeCard({
  mode,
  selected,
  disabled,
  label,
  onSelect,
}: {
  mode: LayoutMode
  selected: boolean
  disabled: boolean
  label: string
  onSelect: (mode: LayoutMode) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      data-layout-mode={mode}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg border p-2 text-left outline-none transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        selected && "border-primary bg-primary/5",
      )}
      onClick={() => onSelect(mode)}
    >
      <span className="relative flex h-12 w-full overflow-hidden rounded bg-muted" aria-hidden="true">
        {mode !== "horizontal" && <span className="w-3 bg-primary/80" />}
        {mode.includes("mix") && <span className="w-4 bg-primary/35" />}
        <span className="flex min-w-0 flex-1 flex-col gap-1 p-1">
          {(mode === "horizontal" || mode.includes("header-first") || mode.startsWith("top-hybrid")) && (
            <span className="h-2 rounded-sm bg-primary/65" />
          )}
          <span className="min-h-0 flex-1 rounded-sm bg-background" />
        </span>
      </span>
      <span className="w-full truncate text-center text-xs">{label}</span>
    </button>
  )
}
