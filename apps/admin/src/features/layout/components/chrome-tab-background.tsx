import { useId } from "react"

import { cn } from "@rapidkit/ui/lib/utils"

interface ChromeTabBackgroundProps {
  className?: string
}

export function ChromeTabBackground({ className }: ChromeTabBackgroundProps) {
  const geometryId = `chrome-tab-geometry-${useId().replaceAll(":", "")}`

  return (
    <svg aria-hidden="true" className={cn("size-full", className)} data-testid="chrome-tab-background">
      <defs>
        <symbol id={geometryId} viewBox="0 0 214 36">
          <path d="M17 0h197v36H0v-2c4.5 0 9-3.5 9-8V8c0-4.5 3.5-8 8-8z" />
        </symbol>
      </defs>
      <svg height="100%" width="51%">
        <use fill="currentColor" height="36" href={`#${geometryId}`} width="214" />
      </svg>
      <g transform="scale(-1, 1)">
        <svg height="100%" width="51%" x="-100%" y="0">
          <use fill="currentColor" height="36" href={`#${geometryId}`} width="214" />
        </svg>
      </g>
    </svg>
  )
}
