# Admin Sidebar Current-Components Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Admin's current vertical sidebar around centralized route selection and expansion state, while retaining the existing React and Base UI components and matching frontend's current vertical-menu behavior and measurements.

**Architecture:** Add route metadata and pure selection helpers first, then introduce a provider-controlled sidebar component family behind the existing `Sidebar` and `SidebarMenu` public entry points. Keep Base UI Collapsible, Popover, Tooltip, Sheet, and ScrollArea; centralize state without importing Vue or Naive UI patterns.

**Tech Stack:** React 19, TypeScript, React Router 7, Zustand 5, Base UI through `@rapidkit/ui`, Tailwind CSS 4, Lucide React, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-09-admin-sidebar-current-components-refactor-design.md`

## Global Constraints

- Implement only the current vertical sidebar; do not add vertical-mix, hybrid, top, or horizontal modes.
- Do not add Vue, Pinia, Naive UI, Teleport, or a new menu dependency.
- Preserve Base UI keyboard behavior, focus restoration, Tooltip, Popover, Sheet, ScrollArea, and reduced-motion support.
- Preserve internal navigation, external navigation with `noopener,noreferrer`, arbitrary-depth menu rendering, localization, and hidden-menu filtering.
- Keep `sidebar.tsx` and `sidebar-menu.tsx` as compatibility entry points for existing imports and tests.
- Use Admin semantic theme tokens; do not copy frontend theme infrastructure.
- Use test-driven development: add and run each focused failing test before its production change.
- Do not modify unrelated Header, Tabs, content-layout, backend authorization, or theme-workbench behavior.

## File map

```text
apps/admin/src/features/layout/components/
├── sidebar.tsx                         # compatibility entry + desktop shell
├── sidebar-menu.tsx                    # compatibility exports
├── mobile-nav.tsx                      # Sheet composition
├── use-mobile-watch.ts                 # breakpoint observer only
└── sidebar/
    ├── sidebar-brand.tsx               # shared logo/title
    ├── sidebar-icon.tsx                # icon/localIcon resolution
    ├── sidebar-menu-selection.ts       # pure selection/path/expansion helpers
    ├── sidebar-menu-provider.tsx       # route-derived controlled state
    ├── sidebar-menu.tsx                # nav + ScrollArea
    ├── sidebar-menu-node.tsx           # group/leaf dispatch
    ├── sidebar-menu-leaf.tsx           # navigation + Tooltip
    ├── sidebar-menu-group.tsx          # Collapsible + Popover
    └── sidebar-menu-styles.ts          # state-aware class helpers
```

---

### Task 1: Preserve `activeMenu` route metadata

**Files:**

- Modify: `apps/admin/src/services/api/route.ts`
- Modify: `apps/admin/src/stores/route.ts`
- Modify: `apps/admin/src/stores/route.test.ts`

**Interfaces:**

- Consumes: backend `meta.activeMenu?: string | null`.
- Produces: normalized `MenuItem.activeMenu?: string` available through both `menus` and `flat`.

- [ ] **Step 1: Add a failing route-normalization assertion**

  Extend the existing route-store test input and assertions:

  ```ts
  meta: {
    title: "用户详情",
    i18nKey: "route.manage_user_detail",
    icon: "lucide:user",
    localIcon: "user-avatar",
    hideInMenu: true,
    activeMenu: "manage_user",
  }

  assert.equal(item.activeMenu, "manage_user")
  ```

- [ ] **Step 2: Run the route-store test and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/stores/route.test.ts
  ```

  Expected: TypeScript transform or assertion failure because `BackendRoute.meta` and `MenuItem` do not expose `activeMenu`.

- [ ] **Step 3: Add the route field without adding selection behavior**

  Add `activeMenu?: string | null` to `BackendRoute.meta`, `activeMenu?: string` to `MenuItem`, and copy it during `normalize`:

  ```ts
  activeMenu: r.meta?.activeMenu ?? undefined,
  ```

  Do not interpret or validate the key in the route store.

- [ ] **Step 4: Run the route-store test and verify GREEN**

  Run the Task 1 test command again. Expected: all route-store tests pass.

- [ ] **Step 5: Commit the metadata contract**

  ```bash
  git add apps/admin/src/services/api/route.ts apps/admin/src/stores/route.ts apps/admin/src/stores/route.test.ts
  git commit -m "feat(admin): preserve active menu metadata"
  ```

---

### Task 2: Add pure menu selection and expansion helpers

**Files:**

- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-selection.ts`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-selection.test.ts`

**Interfaces:**

- Consumes: `MenuItem[]`, normalized current route, pathname, and the current expanded-key set.
- Produces:

  ```ts
  export function getVisibleChildren(item: MenuItem): MenuItem[]
  export function findMenuPath(menus: MenuItem[], targetKey: string): string[]
  export function resolveSelectedMenuKey(input: {
    currentRoute?: MenuItem
    menus: MenuItem[]
    pathname: string
  }): string | null
  export function getSelectedParentKeys(selectedPath: readonly string[]): string[]
  export function reconcileExpandedKeys(input: {
    collapsed: boolean
    current: ReadonlySet<string>
    selectedPath: readonly string[]
    restoreSelectedPath: boolean
  }): Set<string>
  ```

- [ ] **Step 1: Write failing selection tests**

  Cover exact key selection, hidden-route `activeMenu`, invalid `activeMenu` fallback, exact pathname fallback, hidden-node exclusion, arbitrary-depth path discovery, and a missing-route result:

  ```ts
  test("hidden routes select their declared visible parent", () => {
    const menus = [group("manage", [leaf("manage_user", "/manage/user")])]
    const selected = resolveSelectedMenuKey({
      currentRoute: leaf("manage_user_detail", "/manage/user/42", {
        hideInMenu: true,
        activeMenu: "manage_user",
      }),
      menus,
      pathname: "/manage/user/42",
    })
    expect(selected).toBe("manage_user")
  })

  test("findMenuPath returns every ancestor at arbitrary depth", () => {
    const menus = [group("system", [group("identity", [leaf("users", "/users")])])]
    expect(findMenuPath(menus, "users")).toEqual(["system", "identity", "users"])
  })
  ```

- [ ] **Step 2: Run the selection test and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-menu-selection.test.ts
  ```

  Expected: FAIL because the selection module does not exist.

- [ ] **Step 3: Implement visible-tree lookup and deterministic fallback**

  Implement depth-first traversal over visible nodes. Resolve in this order:

  ```ts
  const requestedKey = currentRoute?.hideInMenu ? currentRoute.activeMenu : currentRoute?.key
  if (requestedKey && findMenuPath(menus, requestedKey).length) return requestedKey
  if (currentRoute?.key && findMenuPath(menus, currentRoute.key).length) return currentRoute.key
  return findKeyByExactPath(menus, pathname)
  ```

  Never use prefix matching.

- [ ] **Step 4: Add failing expansion reconciliation tests**

  Verify parent extraction, manual expansion preservation, route-change restoration, collapse preservation, and re-expansion restoration:

  ```ts
  test("a route change preserves manual groups and restores selected parents", () => {
    const result = reconcileExpandedKeys({
      collapsed: false,
      current: new Set(["reports"]),
      selectedPath: ["system", "users", "users_detail"],
      restoreSelectedPath: true,
    })
    expect([...result]).toEqual(["reports", "system", "users"])
  })

  test("collapse keeps the stored expansion set for later restoration", () => {
    const result = reconcileExpandedKeys({
      collapsed: true,
      current: new Set(["system"]),
      selectedPath: ["system", "users"],
      restoreSelectedPath: false,
    })
    expect([...result]).toEqual(["system"])
  })
  ```

- [ ] **Step 5: Run the expansion tests and verify RED**

  Run the Task 2 command again. Expected: selection tests pass and new expansion tests fail because reconciliation is missing.

- [ ] **Step 6: Implement expansion reconciliation**

  Return a new `Set` on every change and always preserve `current`. When `collapsed` is false and `restoreSelectedPath` is true, add `getSelectedParentKeys(selectedPath)`. The provider passes `restoreSelectedPath: true` only after a pathname change or a collapsed-to-expanded transition. Do not clear stored keys merely because `collapsed` is true; rendering code controls inline visibility.

- [ ] **Step 7: Run the selection module tests and verify GREEN**

  Run the Task 2 command again. Expected: all selection and expansion helper tests pass.

- [ ] **Step 8: Commit the pure state model**

  ```bash
  git add apps/admin/src/features/layout/components/sidebar/sidebar-menu-selection.ts apps/admin/src/features/layout/components/sidebar/sidebar-menu-selection.test.ts
  git commit -m "feat(admin): centralize sidebar menu selection"
  ```

---

### Task 3: Resolve `icon` and `localIcon` through one menu API

**Files:**

- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-icon.tsx`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-icon.test.ts`
- Modify: `apps/admin/src/features/layout/components/icon-map.tsx`
- Modify: `apps/admin/src/features/layout/components/page-tabs.tsx`
- Modify: `apps/admin/src/features/layout/components/page-tabs.test.ts`

**Interfaces:**

- Consumes:

  ```ts
  interface MenuIconSource {
    icon?: string
    localIcon?: string
  }
  ```

- Produces:

  ```ts
  export function resolveMenuIcon(source: MenuIconSource): LucideIcon
  ```

- [ ] **Step 1: Write failing resolver-precedence tests**

  Add tests proving local icon aliases win, ordinary icon names work, semantic fallback still works, and unknown values return `Circle`:

  ```ts
  test("localIcon takes precedence over icon", () => {
    expect(resolveMenuIcon({ localIcon: "home", icon: "lucide:users" })).toBe(LayoutDashboard)
  })

  test("unknown icon metadata returns the shared fallback", () => {
    expect(resolveMenuIcon({ localIcon: "unknown-local", icon: "unknown-icon" })).toBe(Circle)
  })
  ```

- [ ] **Step 2: Run the icon test and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-icon.test.ts
  ```

  Expected: FAIL because `resolveMenuIcon` does not exist.

- [ ] **Step 3: Extract explicit aliases and preserve semantic fallback**

  Move or export the existing Lucide mapping from `icon-map.tsx`. Implement `resolveMenuIcon` with `localIcon` first, then `icon`, then semantic regular expressions, then `Circle`. Keep the existing `resolveIcon(name?: string)` export as a compatibility wrapper:

  ```ts
  export function resolveIcon(name?: string): LucideIcon {
    return resolveMenuIcon({ icon: name })
  }
  ```

- [ ] **Step 4: Use the unified resolver in PageTabs**

  Replace:

  ```ts
  resolveIcon(tab.icon ?? tab.localIcon)
  ```

  with:

  ```ts
  resolveMenuIcon({ icon: tab.icon, localIcon: tab.localIcon })
  ```

  Update the PageTabs source-contract assertion to match the new call.

- [ ] **Step 5: Run icon and PageTabs tests and verify GREEN**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-icon.test.ts src/features/layout/components/page-tabs.test.ts
  ```

  Expected: all icon and PageTabs tests pass.

- [ ] **Step 6: Commit the resolver**

  ```bash
  git add apps/admin/src/features/layout/components/sidebar/sidebar-icon.tsx apps/admin/src/features/layout/components/sidebar/sidebar-icon.test.ts apps/admin/src/features/layout/components/icon-map.tsx apps/admin/src/features/layout/components/page-tabs.tsx apps/admin/src/features/layout/components/page-tabs.test.ts
  git commit -m "refactor(admin): unify sidebar icon resolution"
  ```

---

### Task 4: Introduce the controlled sidebar provider

**Files:**

- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-provider.tsx`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-provider.dom.test.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar-menu.tsx`

**Interfaces:**

- Consumes the `SidebarMenuProviderProps` and pure helpers defined in the design.
- Produces `useSidebarMenu(): SidebarMenuContextValue`; callers outside the provider throw a clear error.

- [ ] **Step 1: Write failing provider tests**

  Render a small consumer inside `MemoryRouter` and assert selected key, selected path, expanded keys, manual group updates, collapse preservation, and restoration after route change:

  ```tsx
  function Probe() {
    const menu = useSidebarMenu()
    return (
      <output data-testid="state">
        {JSON.stringify({
          selectedKey: menu.selectedKey,
          selectedPath: menu.selectedPath,
          expandedKeys: [...menu.expandedKeys],
        })}
      </output>
    )
  }
  ```

  Also assert that calling `useSidebarMenu()` outside a provider throws `useSidebarMenu must be used within SidebarMenuProvider`.

- [ ] **Step 2: Run the provider test and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-menu-provider.dom.test.tsx
  ```

  Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Implement provider state from route identity**

  Use `useLocation`, `useRouteStore`, `useMemo`, `useRef`, `useState`, and `useEffect`. Derive `currentRoute` from `flat[pathname]`, then derive selected key and path with the Task 2 helpers. Track the previous pathname and previous `collapsed` value in refs. Pass `restoreSelectedPath: true` exactly when the pathname changes or `collapsed` changes from true to false, so users can manually close an active ancestor until one of those restoration events occurs.

  `setGroupExpanded` must clone the set:

  ```ts
  setExpandedKeys((current) => {
    const next = new Set(current)
    if (expanded) next.add(key)
    else next.delete(key)
    return next
  })
  ```

  Expose `closeTransientSurface` as `onNavigateComplete ?? noop`.

- [ ] **Step 4: Re-export provider APIs through the compatibility module**

  From `sidebar-menu.tsx`, export `SidebarMenuProvider` and `useSidebarMenu` while leaving the current `SidebarMenu` implementation in place. This task changes state infrastructure without changing menu markup.

- [ ] **Step 5: Run provider and existing sidebar tests and verify GREEN**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-menu-provider.dom.test.tsx src/features/layout/components/sidebar-menu.test.ts
  ```

  Expected: provider and existing sidebar behavior tests pass.

- [ ] **Step 6: Commit the provider**

  ```bash
  git add apps/admin/src/features/layout/components/sidebar/sidebar-menu-provider.tsx apps/admin/src/features/layout/components/sidebar/sidebar-menu-provider.dom.test.tsx apps/admin/src/features/layout/components/sidebar-menu.tsx
  git commit -m "refactor(admin): add controlled sidebar menu provider"
  ```

---

### Task 5: Split node, leaf, and group rendering behind compatibility exports

**Files:**

- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu.tsx`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-node.tsx`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-leaf.tsx`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-group.tsx`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu.dom.test.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar-menu.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar.tsx`
- Modify: `apps/admin/src/features/layout/components/mobile-nav.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar-menu.test.ts`

**Interfaces:**

- `SidebarMenu` consumes no props; it reads menus from the provider.
- `SidebarMenuNode` consumes `{ item: MenuItem; depth: number; inFlyout?: boolean }`.
- `SidebarMenuLeaf` and `SidebarMenuGroup` consume the same node props.
- The compatibility `SidebarMenu` consumes `{ collapsed?: boolean; onNavigateComplete?: () => void }` and creates a provider for legacy callers.

- [ ] **Step 1: Write failing DOM tests for the decomposed menu**

  Test these behaviors with `MemoryRouter` and a seeded route store:

  - Active leaf exposes `aria-current="page"`.
  - Active ancestor trigger exposes `data-branch-active="true"`.
  - Internal navigation calls the transient close callback.
  - External navigation uses `_blank` and `noopener,noreferrer` and does not call React Router navigation.
  - A parent with only hidden children renders no empty group panel.
  - A collapsed leaf renders a Tooltip.
  - A collapsed group opens a Popover and restores focus to its trigger.

  Query accessible roles and labels rather than implementation class names for interaction assertions.

- [ ] **Step 2: Run the decomposed-menu test and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-menu.dom.test.tsx
  ```

  Expected: FAIL because the split menu components do not exist.

- [ ] **Step 3: Implement the render-only SidebarMenu and dispatcher**

  `SidebarMenu` renders:

  ```tsx
  <ScrollArea className="min-h-0 flex-1">
    <nav data-layout-scroll="sidebar" className="flex flex-col gap-1 px-2 py-2">
      {visibleMenus.map((item) => <SidebarMenuNode key={item.key} item={item} depth={0} />)}
    </nav>
  </ScrollArea>
  ```

  `SidebarMenuNode` uses `getVisibleChildren(item)` before selecting group or leaf.

- [ ] **Step 4: Implement the leaf with current Base UI primitives**

  Keep a native button, focus ring, translated label, unified Task 3 icon resolver, and secure external navigation. Read `selectedKey` and `collapsed` from the provider. Call `closeTransientSurface()` after the navigation action.

- [ ] **Step 5: Implement the controlled group**

  Replace local `expanded` route effects with `isExpanded(item.key)` and `setGroupExpanded`. Render inline content only through controlled Collapsible behavior. In collapsed mode, open a controlled Popover and render child nodes with `inFlyout` and depth zero. Retain `finalFocus={popoverTriggerRef}`.

- [ ] **Step 6: Replace the compatibility module body**

  Make the public `sidebar-menu.tsx` compose the new provider and internal menu:

  ```tsx
  export function SidebarMenu({ collapsed = false, onNavigateComplete }: SidebarMenuProps) {
    const menus = useRouteStore((state) => state.menus)
    return (
      <SidebarMenuProvider collapsed={collapsed} menus={menus} onNavigateComplete={onNavigateComplete}>
        <SidebarMenuContent />
      </SidebarMenuProvider>
    )
  }
  ```

  Re-export pure class helpers temporarily so current tests remain valid until Task 7 moves them.

- [ ] **Step 7: Wire transient closing into mobile navigation**

  Pass `onNavigateComplete={() => setMobileNavOpen(false)}` from `MobileNav`. Desktop `Sidebar` keeps the callback undefined.

- [ ] **Step 8: Run focused interaction tests and verify GREEN**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-menu.dom.test.tsx src/features/layout/components/sidebar-menu.test.ts src/features/layout/components/sidebar.test.ts
  ```

  Expected: all new and compatibility tests pass.

- [ ] **Step 9: Commit the component split**

  ```bash
  git add apps/admin/src/features/layout/components/sidebar apps/admin/src/features/layout/components/sidebar-menu.tsx apps/admin/src/features/layout/components/sidebar.tsx apps/admin/src/features/layout/components/mobile-nav.tsx apps/admin/src/features/layout/components/sidebar-menu.test.ts
  git commit -m "refactor(admin): split sidebar menu components"
  ```

---

### Task 6: Add the shared sidebar brand

**Files:**

- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-brand.tsx`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-brand.dom.test.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar.tsx`
- Modify: `apps/admin/src/features/layout/components/mobile-nav.tsx`
- Modify: `apps/admin/src/locales/en-US/common.json`
- Modify: `apps/admin/src/locales/zh-CN/common.json`

**Interfaces:**

- Consumes: `{ collapsed: boolean; className?: string }`.
- Produces: one stable 32px `/logo-loading.svg` image and a translated product title whose width/opacity responds to `collapsed`.

- [ ] **Step 1: Write failing brand DOM tests**

  Assert both variants render the same logo node, expanded mode shows the title, collapsed mode keeps the image while applying `max-w-0 opacity-0` to the title, and the logo has accessible name `RapidKit`.

- [ ] **Step 2: Run the brand test and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-brand.dom.test.tsx
  ```

  Expected: FAIL because `SidebarBrand` does not exist.

- [ ] **Step 3: Implement the stable brand composition**

  Render:

  ```tsx
  <Link to="/" className={cn("flex h-14 shrink-0 items-center justify-center overflow-hidden", className)}>
    <img src="/logo-loading.svg" alt="RapidKit" className="size-8 shrink-0" />
    <span className={cn("overflow-hidden whitespace-nowrap pl-2 text-base font-bold text-sidebar-primary transition-[max-width,opacity] duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-36 opacity-100")}>
      {t("system.title")}
    </span>
  </Link>
  ```

  Add `system.title` translations only if the key is not already present.

- [ ] **Step 4: Reuse the brand in desktop and mobile**

  Replace the desktop text/R switch and the mobile `RapidKit` span. In mobile pass `collapsed={false}` and retain the Sheet close button next to the brand.

- [ ] **Step 5: Run brand, sidebar, and mobile tests and verify GREEN**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-brand.dom.test.tsx src/features/layout/components/sidebar.test.ts src/features/layout/components/header.test.ts
  ```

  Expected: all brand and layout integration tests pass.

- [ ] **Step 6: Commit the brand**

  ```bash
  git add apps/admin/src/features/layout/components/sidebar/sidebar-brand.tsx apps/admin/src/features/layout/components/sidebar/sidebar-brand.dom.test.tsx apps/admin/src/features/layout/components/sidebar.tsx apps/admin/src/features/layout/components/mobile-nav.tsx apps/admin/src/locales/en-US/common.json apps/admin/src/locales/zh-CN/common.json
  git commit -m "feat(admin): unify sidebar branding"
  ```

---

### Task 7: Align vertical-menu measurements and active/hover states

**Files:**

- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-styles.ts`
- Create: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-styles.test.ts`
- Modify: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-leaf.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar/sidebar-menu-group.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar-menu.tsx`
- Modify: `apps/admin/src/features/layout/components/sidebar-menu.test.ts`

**Interfaces:**

- Produces:

  ```ts
  getMenuButtonClasses(input: { collapsed: boolean; active: boolean; branchActive: boolean }): string
  getMenuIconClasses(collapsed: boolean): string
  getMenuIndentStyle(depth: number, collapsed: boolean): CSSProperties | undefined
  getMenuLabelClasses(collapsed: boolean): string
  getMenuChevronClasses(expanded: boolean, collapsed: boolean): string
  getSubmenuPanelClasses(): string
  ```

- [ ] **Step 1: Write failing measurement and state tests**

  Assert:

  ```ts
  expect(getMenuIconClasses(false)).toContain("size-4")
  expect(getMenuIconClasses(true)).toContain("size-[22px]")
  expect(getMenuIndentStyle(0, false)).toEqual({ paddingLeft: "12px" })
  expect(getMenuIndentStyle(1, false)).toEqual({ paddingLeft: "30px" })
  expect(getMenuButtonClasses({ collapsed: false, active: true, branchActive: false })).toContain("text-sidebar-primary")
  expect(getMenuButtonClasses({ collapsed: false, active: true, branchActive: false })).not.toContain("text-sidebar-primary-foreground")
  ```

  Add source assertions that active styles appear after general hover styles and include an active-hover override.

- [ ] **Step 2: Run style tests and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-menu-styles.test.ts src/features/layout/components/sidebar-menu.test.ts
  ```

  Expected: FAIL because the style module does not exist and current active state uses solid `bg-sidebar-primary text-sidebar-primary-foreground`.

- [ ] **Step 3: Implement frontend-aligned dimensions**

  Use 36px tokenized height, 16px expanded icons, 22px collapsed top-level icons, 18px per nested depth, 8px sidebar padding, and 300ms transitions. Keep depth-zero expanded padding at 12px so the first nested level becomes 30px.

- [ ] **Step 4: Implement semantic active and hover classes**

  Define reusable CSS variables in the button class through arbitrary properties or a colocated CSS module:

  ```css
  background: color-mix(in oklab, var(--sidebar-primary) 10%, var(--sidebar) 90%);
  color: var(--sidebar-primary);
  ```

  Active leaf hover retains this surface. Active ancestors use 6% primary with the same primary foreground. Inactive hover remains `bg-sidebar-accent text-sidebar-accent-foreground`.

- [ ] **Step 5: Adopt the style helpers in leaf and group components**

  Remove duplicated class construction from both components. Apply 22px only to collapsed top-level triggers; Popover descendants use the expanded 16px sizing.

- [ ] **Step 6: Run style and menu DOM tests and verify GREEN**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/features/layout/components/sidebar/sidebar-menu-styles.test.ts src/features/layout/components/sidebar/sidebar-menu.dom.test.tsx src/features/layout/components/sidebar-menu.test.ts
  ```

  Expected: all visual-contract and interaction tests pass.

- [ ] **Step 7: Commit the visual alignment**

  ```bash
  git add apps/admin/src/features/layout/components/sidebar/sidebar-menu-styles.ts apps/admin/src/features/layout/components/sidebar/sidebar-menu-styles.test.ts apps/admin/src/features/layout/components/sidebar/sidebar-menu-leaf.tsx apps/admin/src/features/layout/components/sidebar/sidebar-menu-group.tsx apps/admin/src/features/layout/components/sidebar-menu.tsx apps/admin/src/features/layout/components/sidebar-menu.test.ts
  git commit -m "style(admin): align vertical sidebar states"
  ```

---

### Task 8: Preserve desktop collapse state across mobile transitions

**Files:**

- Modify: `apps/admin/src/stores/app.ts`
- Create: `apps/admin/src/stores/app.test.ts`
- Modify: `apps/admin/src/features/layout/components/use-mobile-watch.ts`
- Modify: `apps/admin/src/features/layout/components/admin-layout.tsx`
- Modify: `apps/admin/src/stores/task-14.test.ts`
- Modify: `apps/admin/src/features/layout/components/scroll-layout.test.ts`

**Interfaces:**

- Produces app state/actions:

  ```ts
  desktopSiderCollapse: boolean
  hasUserSetSiderCollapse: boolean
  toggleSider: () => void
  setSiderCollapse: (value: boolean, source?: "user" | "theme") => void
  setIsMobile: (value: boolean) => void
  ```

- [ ] **Step 1: Write failing store transition tests**

  Cover expanded and collapsed desktop round trips:

  ```ts
  test("mobile round trip restores the user's desktop collapse state", () => {
    useAppStore.setState({
      siderCollapse: true,
      desktopSiderCollapse: true,
      hasUserSetSiderCollapse: true,
      isMobile: false,
    })

    useAppStore.getState().setIsMobile(true)
    expect(useAppStore.getState().desktopSiderCollapse).toBe(true)

    useAppStore.getState().setIsMobile(false)
    expect(useAppStore.getState().siderCollapse).toBe(true)
  })
  ```

  Also verify a theme default is accepted before user interaction and ignored afterward.

- [ ] **Step 2: Run app-store tests and verify RED**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/stores/app.test.ts src/stores/task-14.test.ts
  ```

  Expected: FAIL because backup state and source-aware setter behavior do not exist.

- [ ] **Step 3: Implement atomic responsive transitions in the store**

  `toggleSider` marks user intent and updates the desktop backup when not mobile. `setSiderCollapse(value, "theme")` updates the desktop value only while `hasUserSetSiderCollapse` is false. `setIsMobile(true)` preserves the backup and collapses the desktop state; `setIsMobile(false)` restores the backup.

- [ ] **Step 4: Keep the breakpoint hook detection-only**

  `useMobileWatch` continues to call only `setIsMobile(mql.matches)`. Do not add backup refs or layout state to the hook.

- [ ] **Step 5: Make AdminLayout apply defaults through the theme source**

  Replace the unconditional desktop reset with:

  ```ts
  setSiderCollapse(theme.layout.defaultSidebarCollapsed, "theme")
  ```

  The store decides whether the theme default is still allowed.

- [ ] **Step 6: Run responsive and layout tests and verify GREEN**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run src/stores/app.test.ts src/stores/task-14.test.ts src/features/layout/components/scroll-layout.test.ts src/features/layout/components/header.test.ts
  ```

  Expected: all responsive, mobile-nav, and layout tests pass.

- [ ] **Step 7: Commit responsive state restoration**

  ```bash
  git add apps/admin/src/stores/app.ts apps/admin/src/stores/app.test.ts apps/admin/src/features/layout/components/use-mobile-watch.ts apps/admin/src/features/layout/components/admin-layout.tsx apps/admin/src/stores/task-14.test.ts apps/admin/src/features/layout/components/scroll-layout.test.ts
  git commit -m "fix(admin): restore sidebar state after mobile"
  ```

---

### Task 9: Remove obsolete state code and verify the completed sidebar

**Files:**

- Modify only files already touched in Tasks 1–8 when verification exposes an attributable issue.
- Verify: `apps/admin/src/features/layout/components/sidebar/`
- Verify: `apps/admin/src/features/layout/components/sidebar.tsx`
- Verify: `apps/admin/src/features/layout/components/sidebar-menu.tsx`
- Verify: `apps/admin/src/features/layout/components/mobile-nav.tsx`
- Verify: `apps/admin/src/stores/app.ts`
- Verify: `apps/admin/src/stores/route.ts`

**Interfaces:**

- Produces no new interface; confirms the compatibility exports and completed vertical-sidebar behavior.

- [ ] **Step 1: Add source-contract assertions for removed legacy ownership**

  In the compatibility test, assert the sidebar implementation no longer contains per-group route effects or local branch expansion state:

  ```ts
  assert.doesNotMatch(groupSource, /useState\(branchActive\)/)
  assert.doesNotMatch(groupSource, /useEffect\(/)
  assert.doesNotMatch(groupSource, /resolveMenuGroupExpanded/)
  assert.match(providerSource, /expandedKeys/)
  assert.match(providerSource, /selectedPath/)
  ```

- [ ] **Step 2: Run all focused sidebar tests**

  Run:

  ```bash
  pnpm --filter @rapidkit/admin exec vitest run \
    src/features/layout/components/sidebar \
    src/features/layout/components/sidebar-menu.test.ts \
    src/features/layout/components/sidebar.test.ts \
    src/features/layout/components/header.test.ts \
    src/features/layout/components/scroll-layout.test.ts \
    src/stores/app.test.ts \
    src/stores/route.test.ts
  ```

  Expected: all sidebar, responsive, route, and layout tests pass.

- [ ] **Step 3: Format only changed sidebar files**

  Run `pnpm exec oxfmt --write` with the exact changed files reported by:

  ```bash
  git diff --name-only -- apps/admin/src/features/layout/components apps/admin/src/stores/app.ts apps/admin/src/stores/app.test.ts apps/admin/src/stores/route.ts apps/admin/src/stores/route.test.ts apps/admin/src/services/api/route.ts
  ```

  Pass those paths explicitly to `oxfmt`; do not format the whole dirty workspace.

- [ ] **Step 4: Run complete automated verification**

  ```bash
  pnpm --filter @rapidkit/admin test
  pnpm exec oxlint \
    apps/admin/src/features/layout/components/sidebar \
    apps/admin/src/features/layout/components/sidebar.tsx \
    apps/admin/src/features/layout/components/sidebar-menu.tsx \
    apps/admin/src/features/layout/components/mobile-nav.tsx \
    apps/admin/src/features/layout/components/use-mobile-watch.ts \
    apps/admin/src/features/layout/components/admin-layout.tsx \
    apps/admin/src/stores/app.ts \
    apps/admin/src/stores/route.ts \
    apps/admin/src/services/api/route.ts
  pnpm --filter @rapidkit/admin typecheck
  pnpm --filter @rapidkit/ui typecheck
  pnpm --filter @rapidkit/admin build
  git diff --check
  ```

  Expected: 0 test failures, 0 lint warnings or errors, both type checks exit 0, production build exits 0, and diff check emits no output.

- [ ] **Step 5: Inspect real rendered states**

  Start `pnpm --filter @rapidkit/admin dev`, authenticate, and inspect at least one three-level menu in:

  - Expanded light mode: selected path open, active leaf stable on hover, ancestor visibly weaker.
  - Collapsed light mode: 22px top-level icons, Tooltip for leaf, Popover for group.
  - Expanded dark mode: semantic active/hover contrast remains distinct.
  - Collapsed dark mode: Popover uses popover tokens rather than constrained sidebar colors.
  - Mobile width below 640px: Sheet closes after navigation.
  - Desktop after returning from mobile: the prior desktop collapse preference is restored.

- [ ] **Step 6: Review scope and compatibility**

  Confirm the diff introduces no frontend layout modes, no new UI dependency, no backend authorization change, and no unrelated Header/Tabs/theme changes. Confirm existing imports of `Sidebar` and `SidebarMenu` remain valid.

- [ ] **Step 7: Commit final test cleanup if needed**

  If Steps 1–6 required test-only corrections, stage only those tests and commit:

  ```bash
  git add apps/admin/src/features/layout/components/sidebar-menu.test.ts apps/admin/src/features/layout/components/sidebar.test.ts
  git commit -m "test(admin): verify sidebar refactor"
  ```
