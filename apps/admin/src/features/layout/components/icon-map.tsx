import type { LucideIcon } from "lucide-react"
import { resolveMenuIcon } from "./sidebar/sidebar-icon"

export function resolveIcon(name?: string): LucideIcon {
  return resolveMenuIcon({ icon: name })
}
