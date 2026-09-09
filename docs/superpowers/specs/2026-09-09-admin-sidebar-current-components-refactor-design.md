# Admin Sidebar Current-Components Refactor Design

## Goal

Completely refactor the current `apps/admin` vertical sidebar so its selection, expansion, collapse, icon, responsive, active, and hover behavior aligns with the current vertical sidebar in `apps/frontend`, while remaining native to Admin's React 19, Base UI, Zustand, React Router, Tailwind CSS, and shadcn theme-token architecture.

This work does not copy Vue, Naive UI, Pinia, or Teleport into Admin. It reproduces the reference behavior by composing the components and state mechanisms Admin already uses.

## Scope

The refactor includes:

- Centralized selected-menu and expanded-menu state.
- Support for hidden routes that identify a visible parent menu through `activeMenu`.
- Correct icon resolution for both `icon` and `localIcon` route metadata.
- Component decomposition for the brand, menu provider, node, leaf, and group responsibilities.
- Desktop expanded and collapsed presentations.
- Base UI Popover rendering for collapsed groups.
- Base UI Tooltip rendering for collapsed leaves.
- Frontend-aligned menu measurements and active/hover presentation.
- Preservation and restoration of desktop collapse state across mobile viewport changes.
- Focus, keyboard, external navigation, scrolling, and reduced-motion behavior.

The refactor excludes:

- Frontend's `vertical-mix`, hybrid, top, and horizontal layout modes.
- Vue Teleport-style menu mounting.
- Naive UI or another menu component dependency.
- Changes to backend authorization semantics.
- Unrelated Header, Tabs, content-layout, or theme-workbench redesign.

## Reference behavior

The `apps/frontend` vertical sidebar uses one selected menu key and one expanded-key collection. The selected key comes from the current route name, except a hidden route can nominate a visible menu through `meta.activeMenu`. When the route changes, the menu derives the selected key's ancestor path and expands that path. Collapsing the sidebar hides inline submenus; expanding restores the active route path.

Admin must reproduce those semantics without reproducing Naive UI's internal component model. Existing Admin advantages remain intact: recursive arbitrary-depth menus, Base UI focus management, separate Tooltip and Popover surfaces, semantic sidebar theme variables, and React Router navigation.

## Architecture

The sidebar becomes a small component family with explicit ownership:

```text
Sidebar
├── SidebarBrand
└── SidebarMenuProvider
    └── SidebarMenu
        └── SidebarMenuNode
            ├── SidebarMenuLeaf
            └── SidebarMenuGroup

MobileNav
└── SidebarMenuProvider
    └── SidebarMenu
```

`SidebarMenuProvider` owns menu state and actions. Rendering components consume that context and contain no route-derived state of their own. Desktop and mobile create separate provider instances because they are mutually exclusive surfaces, but both follow the same state rules.

The existing public modules remain compatibility entry points:

- `features/layout/components/sidebar.tsx` exports `Sidebar` and `getSidebarClasses`.
- `features/layout/components/sidebar-menu.tsx` exports `SidebarMenu` and any pure helpers still used by tests.

Implementation details move into `features/layout/components/sidebar/`. `AdminLayout`, `Header`, and `MobileNav` keep importing the compatibility entry points, preventing the refactor from spreading through unrelated layout code.

## Component responsibilities

### Sidebar

`Sidebar` owns the desktop `<aside>`, width transition, layout data attributes, border, background, and shadow. It reads the collapse value from `useAppStore`, renders `SidebarBrand`, and mounts `SidebarMenuProvider` around `SidebarMenu`.

It does not calculate selected keys, expanded keys, menu paths, or icons.

### SidebarBrand

`SidebarBrand` renders the existing project logo at 32px. When expanded, it also renders the translated product title in the configured primary color. When collapsed, the logo remains centered and the title transitions to zero width and zero opacity.

The component replaces the current text-only `RapidKit`/`R` switch. The logo is never swapped during the width transition, which prevents visual jumping.

### SidebarMenuProvider

The provider consumes:

```ts
interface SidebarMenuProviderProps {
  children: ReactNode
  collapsed: boolean
  menus: MenuItem[]
  onNavigateComplete?: () => void
}
```

It produces:

```ts
interface SidebarMenuContextValue {
  collapsed: boolean
  expandedKeys: ReadonlySet<string>
  selectedKey: string | null
  selectedPath: readonly string[]
  closeTransientSurface: () => void
  isExpanded: (key: string) => boolean
  setGroupExpanded: (key: string, expanded: boolean) => void
}
```

It reads the current pathname and route store once, resolves the selected key, calculates the selected path, and owns the expanded-key set. It also provides one transient-surface close action so successful navigation can close a collapsed Popover or the mobile Sheet without coupling leaves to those containers.

### SidebarMenu

`SidebarMenu` owns `ScrollArea`, the `<nav>` landmark, outer padding, and the iteration of visible top-level menu items. It does not access `useLocation`, `useNavigate`, or expansion state.

### SidebarMenuNode

`SidebarMenuNode` accepts `{ item, depth }`. It renders `SidebarMenuGroup` when the item has visible children and `SidebarMenuLeaf` otherwise. Hidden descendants are filtered before deciding whether a node is a group, so a parent with no visible children behaves as a leaf instead of opening an empty panel.

### SidebarMenuLeaf

The leaf owns internal and external navigation. It uses React Router for internal paths and `window.open(href, "_blank", "noopener,noreferrer")` for external links. After a successful navigation action it calls the provider's transient-surface close action.

It renders a Tooltip only when the sidebar is collapsed outside a group Popover. Its focus ring continues using `--sidebar-ring`.

### SidebarMenuGroup

When expanded, the group uses the existing Base UI-backed `Collapsible`. Its `open` value comes from `expandedKeys`, and `onOpenChange` calls `setGroupExpanded`.

When collapsed, the same trigger opens the existing Base UI-backed `Popover`. The Popover renders visible children through `SidebarMenuNode`, with depth reset to zero inside the popup. `finalFocus` points to the trigger so keyboard focus returns predictably.

The component does not own `useState(branchActive)` or a pathname effect. Those responsibilities move to the provider.

## Route and menu data

`BackendRoute.meta` and `MenuItem` gain:

```ts
activeMenu?: string
```

Route normalization copies `meta.activeMenu` without interpreting it. The sidebar selection module resolves it.

Icon resolution accepts both route icon fields:

```ts
resolveMenuIcon({ icon, localIcon }): LucideIcon
```

Resolution order is:

1. A registered `localIcon` mapping.
2. A registered or recognized external `icon` name.
3. The existing semantic-name rules.
4. The existing `Circle` fallback.

No menu item should silently ignore `localIcon`.

## Selection and expansion model

Pure functions in `sidebar-menu-selection.ts` provide the state derivation:

```ts
findMenuPath(menus: MenuItem[], targetKey: string): string[]
resolveSelectedMenuKey(currentRoute: MenuItem | undefined, menus: MenuItem[]): string | null
getSelectedParentKeys(selectedPath: readonly string[]): string[]
reconcileExpandedKeys(input: {
  collapsed: boolean
  current: ReadonlySet<string>
  selectedPath: readonly string[]
  restoreSelectedPath: boolean
}): Set<string>
```

Selection rules are deterministic:

1. If the current route is hidden and has `activeMenu`, use `activeMenu` when that key exists in the visible menu tree.
2. Otherwise use the current route's own key when it exists in the visible menu tree.
3. Otherwise find the deepest visible menu whose path is an exact match for the current pathname.
4. If no visible menu matches, return `null` and render no active item.

Expansion rules are:

1. On route change, add every selected ancestor key to `expandedKeys`.
2. Do not force the selected leaf into `expandedKeys`.
3. Preserve manually expanded non-active groups while the sidebar stays expanded.
4. Allow a user to manually close an active ancestor during the current route session.
5. On a later route change, restore the new selected route's ancestor path.
6. While collapsed, inline Collapsible panels render closed without destroying `expandedKeys`.
7. When expanded again, the stored set is restored and the selected ancestor path is guaranteed present.

This model preserves Admin's useful manual expansion behavior while making route-driven selection as reliable as frontend.

## Responsive state

`useMobileWatch` remains responsible only for detecting the `<640px` breakpoint. A separate app-store transition records the last desktop collapse value before entering mobile mode and restores it when returning to desktop.

The store state becomes:

```ts
interface AppState {
  siderCollapse: boolean
  desktopSiderCollapse: boolean
  hasUserSetSiderCollapse: boolean
  isMobile: boolean
  mobileNavOpen: boolean
}
```

Rules:

- Desktop toggle updates both `siderCollapse` and `desktopSiderCollapse`.
- Entering mobile closes the desktop sidebar without overwriting the backup.
- Leaving mobile restores `desktopSiderCollapse`.
- Applying a new theme default updates the desktop collapse value only when the user has not explicitly toggled it during the session.
- Navigating in the mobile menu closes the Sheet.

`MobileNav` continues using the current `Sheet`. It reuses `SidebarBrand` and `SidebarMenu` instead of maintaining a visually different header and menu implementation.

## Visual design

The current vertical sidebar uses Admin semantic tokens and frontend measurements:

- Expanded width: `var(--sidebar-width)`, default 220px.
- Collapsed width: `var(--sidebar-width-collapsed)`, default 64px.
- Menu item height: `var(--menu-item-height)`, default 36px.
- Expanded leaf/group icon: 16px.
- Collapsed top-level icon: 22px.
- Brand logo: 32px.
- Menu tree indentation: 18px per depth level.
- Sidebar horizontal padding: 8px.
- Menu item radius: the Admin semantic medium radius.
- Width, label, icon, chevron, and submenu transitions: 300ms with reduced-motion fallback.

Inactive items use `text-sidebar-foreground`. Hover uses `bg-sidebar-accent` and `text-sidebar-accent-foreground`.

Active leaves use a low-emphasis primary surface calculated from `--sidebar-primary` and `--sidebar`; their label and icon use `--sidebar-primary`. Active hover preserves the same active surface and foreground instead of falling back to the neutral hover state.

An active ancestor uses the same primary foreground with a weaker primary surface than the active leaf. The distinction communicates hierarchy without rendering two equally strong selections.

Collapsed Popovers reuse `bg-popover`, `text-popover-foreground`, border, radius, and shadow tokens. They do not inherit the sidebar's constrained width.

## Interaction and accessibility

- Every navigable leaf remains a native button.
- Group triggers remain native buttons through Base UI composition.
- Active leaves expose `aria-current="page"`.
- Group triggers expose Base UI's expanded state.
- Collapsed leaves have translated accessible names and right-side tooltips.
- Collapsed groups have translated accessible names and keyboard-operable Popovers.
- Popover close restores focus to the group trigger.
- External links always use `noopener,noreferrer`.
- Menu scrolling remains keyboard and wheel accessible through `ScrollArea`.
- The collapse transition honors `prefers-reduced-motion`.
- Decorative icons use `aria-hidden="true"`.

## Error and fallback behavior

- An unknown icon renders `Circle` without throwing.
- An invalid `activeMenu` falls back to the current route key, then pathname matching.
- A hidden child is excluded before group determination.
- A group whose children are all hidden is treated as a leaf only when it has a navigable path; otherwise it is omitted.
- Empty menu data renders an empty navigation region without an exception.
- A route absent from the menu tree produces no selected item rather than selecting the nearest string/path prefix.
- Failed external popup creation does not trigger internal navigation.

## Testing strategy

Pure unit tests cover:

- Exact leaf selection.
- Hidden-route `activeMenu` selection.
- Invalid `activeMenu` fallback.
- Arbitrary-depth menu-path discovery.
- Selected-parent extraction.
- Route-change expansion reconciliation.
- Manual expansion preservation.
- Collapse and re-expand behavior.
- `icon` and `localIcon` resolution order.
- Desktop collapse backup and mobile restoration.

DOM tests cover:

- Active leaf and active ancestor styling hooks.
- Hover state class contracts.
- 16px expanded and 22px collapsed icons.
- 18px depth indentation.
- Label and chevron collapse transitions.
- Collapsible open/close behavior.
- Collapsed group Popover rendering and focus restoration.
- Collapsed leaf Tooltip rendering.
- Internal navigation, external navigation, and transient-surface closing.
- Mobile Sheet closing after navigation.
- Brand logo/title behavior in both widths.

Regression verification includes the complete Admin test suite, linting of changed files, Admin and shared UI type checking, a production build, and browser inspection in light/dark, expanded/collapsed, nested-active, and mobile states.

## Migration sequence

1. Add `activeMenu` to the API and normalized route types with tests.
2. Add pure selection/path/expansion helpers with tests.
3. Centralize state in `SidebarMenuProvider` while preserving current DOM and appearance.
4. Split leaf, group, and node rendering without changing behavior.
5. Replace icon guessing entry points with the unified resolver.
6. Introduce `SidebarBrand` and reuse it in desktop and mobile surfaces.
7. Apply frontend-aligned measurements and active/hover states.
8. Add desktop collapse backup and mobile restoration.
9. Remove obsolete per-group route effects and compatibility helpers.
10. Complete automated and browser verification.

Each step must leave the Admin test suite passing. No step may combine route-data changes with visual restyling, so failures remain attributable to one responsibility.

## Acceptance criteria

- The current Admin vertical sidebar selects the same visible menu that frontend would select for ordinary, nested, and hidden routes.
- Route changes expand the selected ancestor path consistently.
- Manual expansion remains usable and does not conflict with route-driven restoration.
- Expanded and collapsed presentations match frontend's current vertical measurements.
- Active and hover states are visually distinct and stable in light and dark themes.
- `localIcon` is no longer ignored.
- Desktop collapse preference survives a mobile-width round trip.
- Desktop and mobile reuse the same brand and menu rendering components.
- Existing Base UI keyboard, focus-restoration, Tooltip, Popover, Sheet, and ScrollArea behavior remains intact.
- No frontend mixed/hybrid/horizontal layout mode is added.
- Tests, lint, type checking, production build, and scoped diff validation pass.
