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

const ICONS: Record<string, LucideIcon> = {
  home: LayoutDashboard,
  dashboard: LayoutDashboard,
  user: Users,
  users: Users,
  setting: Settings,
  settings: Settings,
  menu: Menu,
  role: ShieldCheck,
  permission: ShieldCheck,
  monitoring: Activity,
  department: Building2,
  schedule: Clock,
}

const RULES: Array<[RegExp, LucideIcon]> = [
  [/home|dashboard/i, LayoutDashboard],
  [/user/i, Users],
  [/setting|config/i, Settings],
  [/menu|list/i, Menu],
  [/role|shield|permission/i, ShieldCheck],
  [/monitor|chart|analytic/i, Activity],
  [/department|org/i, Building2],
  [/schedule|clock|time/i, Clock],
  [/code|terminal/i, Terminal],
]

function normalized(name?: string) {
  return name?.replace(/^.*:/, "").toLowerCase()
}

export function resolveMenuIcon({ icon, localIcon }: { icon?: string; localIcon?: string }): LucideIcon {
  const local = normalized(localIcon)
  if (local && ICONS[local]) return ICONS[local]
  const external = normalized(icon)
  if (external && ICONS[external]) return ICONS[external]
  for (const value of [localIcon, icon]) {
    if (!value) continue
    for (const [rule, Icon] of RULES) if (rule.test(value)) return Icon
  }
  return Circle
}
