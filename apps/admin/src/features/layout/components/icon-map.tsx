import {
  Activity,
  Building2,
  Circle,
  Clock,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react"

const RULES: Array<[RegExp, LucideIcon]> = [
  [/home|dashboard/i, LayoutDashboard],
  [/user/i, Users],
  [/setting|config/i, Settings],
  [/menu|list/i, Menu],
  [/role|shield|permission/i, ShieldCheck],
  [/monitor|chart|analytic/i, Activity],
  [/department|org/i, Building2],
  [/schedule|clock|time/i, Clock],
  [/script|code|terminal/i, Terminal],
]

export function resolveIcon(name?: string): LucideIcon {
  if (!name) return Circle

  for (const [re, Icon] of RULES) {
    if (re.test(name)) return Icon
  }

  return Circle
}
