# apps/admin Design-System Migration — Design

- **Date:** 2026-09-02
- **Reference app:** `apps/frontend` (Vue 3 + Naive UI + UnoCSS, Soybean Admin v2 fork) — **not modified**
- **Target app:** `apps/admin` (React 19 + Vite + React Router 7 + Tailwind 4 + `@rapidkit/ui` + Zustand + TanStack Query + i18next + RHF/Zod)
- **Goal:** Port the *visual language, layout, navigation, and interaction patterns* of `apps/frontend` into `apps/admin`, re-implemented natively in React. Build a reusable design system + shell first; validate with one baseline page (Home dashboard). Do **not** copy Vue code, and do **not** migrate unrelated business logic.

## Locked decisions

| Decision | Choice |
|---|---|
| Component library | Use shadcn/ui freely. **Standardize `@rapidkit/ui` onto shadcn/Radix** (convert its current Base UI components + add missing primitives). Consumed only by `apps/admin` (3 files), so low blast radius. |
| Baseline page | **Home dashboard** (in-shell, authenticated — best validates AdminShell + nav). |
| Theme scope | **ThemeToggle (light/dark/auto) + existing runtime primary-color override** only. No 7 layout modes, no full theme-drawer. Single `vertical` layout. |
| Menu data source | **Backend dynamic routes** — wire the existing stubbed `fetchUserRoutes`/`generate-routes` into the router; menu + permissions come from `GET /route/user`. |
| Sidebar surface | **Light surface** (frontend default vertical sider), not the dark "inverted" sider. |
| `@rapidkit/ui` API | Converted components track **stock shadcn props** (so future `shadcn add` stays drop-in), even where the 3 current consumers need small tweaks. |
| Charts | **Recharts** (React-native, pairs with shadcn) — not ECharts. |
| Sequencing | **A — foundation-first, single spec** (package conversion is an early, independently-verifiable phase). |

## Source-of-truth findings

- **`@rapidkit/ui` consumers:** only `apps/admin` — `login-page.tsx`, `sidebar.tsx`, `tab-bar.tsx`. `desktop`/`website` do not import it. `@base-ui/react` is used only inside `packages/ui` (11 files).
- **Backend endpoints (confirmed to exist):**
  - Menu / dynamic routes (menu plugin): `GET /route/constant`, `GET /route/user`, `GET /route/exist`. Backend already filters routes by the user's permissions.
  - Dashboard gating (permission plugin): `GET /dashboard/capabilities`.
  - Feature endpoints for later specs: `menu/manage`, `user`, `monitoring`, `worker`, `schedule`, `script`, `department`, `permission/role|data_policy|field_guard`.
- **Known bug to fix:** admin's `fetchUserRoutes()` calls `/route/user/routes`; backend route is `/route/user`.
- **`@rapidkit/ui` current components (14):** button, input, label, separator, checkbox, badge, scroll-area, table, tabs, dialog, sheet, dropdown-menu, select, sonner.

## Frontend design tokens (values to port)

- Colors: primary `#4361EE` (admin default already); info = primary; success `#2EC4B6`; warning `#F4A62A`; error `#EF476F`.
- Surfaces — page bg light `#F7FAFC` / dark `#121212`; card `#FFFFFF` / `#1C1C1C`; text `#1F1F1F` / `#E0E0E0`; muted `#767C82` / `#858585`.
- Radius: 6px global (`--radius: 0.375rem`); cards `rounded-lg` (8px); login card 12px.
- Layout dims: header 56px, tab 44px, sider 220px / collapsed 64px, content padding 16px.
- Shadows: header `0 1px 2px rgb(0 21 41 / .08)`; sider `2px 0 8px 0 rgb(29 35 41 / .05)`; tab `0 1px 2px rgb(0 21 41 / .08)`.
- Dark mode = `.dark` class on root (both apps already do this); breakpoints = Tailwind (sm640/md768/lg1024/xl1280/2xl1536); mobile `<640px` → sider becomes overlay.

## Section 1 — Design tokens (`src/styles/globals.css`)

Keep admin's existing shadcn oklch token system as source of truth; tune values to frontend's palette; add what shadcn lacks. Runtime `primaryColor → oklch` override in `theme-provider.tsx` stays.

- **Tune existing semantic tokens** (light + dark) to the surface table above: `--background`, `--card`/`--popover`, `--foreground`, `--muted-foreground`, `--border`/`--input`, `--primary`, `--destructive` (= frontend error), `--radius`.
- **Add status tokens** + `-foreground` pairs, both themes, exposed via `@theme inline`: `--success` `#2EC4B6`, `--warning` `#F4A62A`, `--info` = primary → `bg-success` / `text-warning` / etc.
- **Add layout-dimension tokens:** `--header-height: 56px`, `--tab-height: 44px`, `--sidebar-width: 220px`, `--sidebar-width-collapsed: 64px`, `--content-padding: 16px`. Shell reads these — no magic numbers in JSX.
- **Add shadow tokens:** `--shadow-header`, `--shadow-sidebar`, `--shadow-tab` (frontend values).
- **Sidebar tokens** (`--sidebar*`, already present) tuned to light surface (light) / dark surface (dark), aligned with `--card`/`--background`.

Outcome: every component color resolves from a semantic variable; light + dark both defined; no hardcoded hex in components.

## Section 2 — `@rapidkit/ui` → shadcn/Radix

- **Deps:** drop `@base-ui/react`; add per-component `@radix-ui/react-*`; keep `cva`/`clsx`/`tailwind-merge`/`sonner`/`lucide-react`. `cn` util and `@rapidkit/ui/components/*` export map unchanged (keeps `components.json` shadcn CLI aliases valid).
- **Convert (14)** to canonical shadcn implementations, props aligned to **stock shadcn**. Fix the 3 consumers (`login-page`, `sidebar`, `tab-bar`) for any prop shifts.
- **Add (8) primitives** needed by shell/dashboard: `card`, `avatar`, `tooltip`, `popover`, `breadcrumb`, `skeleton`, `switch`, `collapsible`. (Optional `command` deferred with global-search.)
- **Notes:** admin already imports `tw-animate-css`; package styles ride on the consumer's Tailwind (no per-package CSS build). Radix portals themed via root-scoped `.dark`.
- **Gate:** `pnpm --filter rapidkit-admin typecheck` + smoke render of the 3 consumers **before** shell work builds on it.

## Section 3 — AdminShell & layout architecture

Reuse existing working pieces (`admin-layout.tsx`, `tab-bar.tsx`, Zustand `app`/`theme`/`tab` stores); extend stubs. All components in `src/features/layout/components/` (kebab-case files, PascalCase exports).

```
AdminShell (admin-layout.tsx — refactor)
├─ Sidebar (sidebar.tsx — replace placeholder)
│   ├─ SidebarBrand (collapse-aware logo)
│   └─ SidebarMenu (recursive, backend-driven)      → §4
├─ ShellMain
│   ├─ Header (header.tsx — extend)
│   │   ├─ SidebarTrigger
│   │   ├─ Breadcrumbs                                → §4
│   │   └─ HeaderActions → ThemeToggle · UserMenu     → §4
│   ├─ PageTabs (tab-bar.tsx — restyle to chrome)     → §4
│   └─ <main> scroll → PageContainer → <Outlet/>
└─ MobileNav (Sheet drawer overlay)                   → §4
```

- **Desktop:** fixed sidebar width animates 220↔64 from `app.siderCollapse`; `ShellMain` margin tracks it. Header 56px + tabs 44px sticky; only `<main>` scrolls; content padding 16px via `PageContainer`.
- **Mobile (`<640px`, `app.isMobile`):** sidebar leaves flow; `MobileNav` = `Sheet` overlay + backdrop; header shows trigger. No new store.
- **Dimensions** from Section 1 CSS vars.
- **New page primitives:** `PageContainer` (padded scroll wrapper), `PageHeader` (title + description + actions).
- **Store boundaries unchanged:** `app` (collapse/mobile/scroll), `theme` (scheme/primary/radius), `tab` (persisted). Shell components are thin consumers — no business logic.

## Section 4 — Navigation & interaction

**Backend-driven menu:**
- Fix `fetchUserRoutes()` → `GET /route/user`; add `fetchConstantRoutes()` → `GET /route/constant`. React Query hook `useUserRoutes()` (enabled when authed).
- New `route` Zustand store: normalized menu tree + flat lookup (title/icon/order/hideInMenu).
- Wire existing `generate-routes.tsx` (`BackendRoute[]` → `RouteObject[]`) into `AppRouter` (currently unused) so router + menu share one source.
- **Icons:** `icon-map.ts` maps backend icon names → Lucide components, with a fallback icon.

**Components** (`src/features/layout/components/`):
- **`SidebarMenu`** — recursive tree. Active from `useLocation()`; parent auto-expands on active child's key-path (mirrors `getSelectedMenuKeyPath`). Collapsed sidebar: icon-only top items with **tooltip**; submenus as **popover** flyouts. `collapsible` for expand/collapse. Full keyboard nav + `aria-current`.
- **`Breadcrumbs`** — from active route key-path via `route` store; `breadcrumb` primitive; hidden on mobile.
- **`PageTabs`** — restyle existing `tab-bar.tsx` to **chrome** style (raised active tab, close on hover/middle-click, right-click context menu: close / close-others / close-all). Keep existing persisted `tab` store + logic.
- **`UserMenu`** — avatar trigger (`avatar` + `dropdown-menu`); identity header (name/email) + divider + logout → existing `clearAuth`. Mirrors shipped frontend user-menu pattern.
- **`ThemeToggle`** — light/dark/auto cycle → existing `theme` store `colorScheme`; `theme-provider` applies `.dark`. Sun/Moon/Monitor Lucide icons.
- **`MobileNav`** — `Sheet` wrapping `SidebarMenu`; opens from header trigger `<640px`; closes on navigation.

**Permissions:** menu visibility comes from the backend routes response (already permission-filtered server-side) — no invented client-side role gating.

## Section 5 — Common states

`src/features/layout/components/states/`, theme-token driven, i18n via `useTranslation()`:
- **`LoadingState`** — spinner + label; `Skeleton` variant for card/table placeholders (replaces `NSpin`).
- **`EmptyState`** — icon + message + optional action (replaces `NEmpty`).
- **`ErrorState`** — glyph + message + retry; also restyles `403/404/500` shared pages (replaces `exception-base`).
- **Page transition:** lightweight CSS fade on `<Outlet/>`, respects `prefers-reduced-motion`.

## Section 6 — Home dashboard baseline

Rebuild `src/views/home/index.tsx` as the shell's validation page.
- **Gating:** `useDashboardCapabilities()` → `GET /dashboard/capabilities`. States: `LoadingState` → `ErrorState`+retry → `RestrictedHome` → full dashboard.
- **Layout:** 24-col responsive grid (`grid grid-cols-24 gap-14px`); modules registered in `dashboard-registry.ts`, each with `col-span` (`col-span-24`, `xl:col-span-15|9`); rendered only if capability granted.
- **Modules (visual + real data where an endpoint exists):**
  - `StatCards` — icon-chip (`text-{status} bg-{status}/10`), value + colored delta (Card primitive).
  - `ActivityFeed` — timeline list from the activity endpoint.
  - App status / infra / server-resources / api-overview — backed by `monitoring` plugin endpoints where available; any module lacking a ready endpoint renders `EmptyState` (**no faked data**, noted).
  - `TrendCharts` — **Recharts**.
- **Header row:** `text-24px font-700` welcome + live status dot + date + refresh.

## Implementation phases (typecheck green between phases)

1. **Tokens** — extend `globals.css` (surfaces, status, layout-dim vars, shadows); tune light/dark.
2. **`@rapidkit/ui` → shadcn/Radix** — convert 14, add 8, swap deps, fix 3 consumers. **Gate:** typecheck + smoke render.
3. **Shell** — refactor `AdminShell`/`Header`, `PageContainer`/`PageHeader`, mobile `Sheet`. **Gate:** collapse + mobile overlay work.
4. **Navigation** — `useUserRoutes` (URL fix), wire `generate-routes` into `AppRouter`, `route` store, `SidebarMenu`, `Breadcrumbs`, chrome `PageTabs`, `UserMenu`, `ThemeToggle`, `icon-map`. **Gate:** menu backend-driven, active/expand correct.
5. **States** — `LoadingState`/`EmptyState`/`ErrorState`; restyle `403/404/500`.
6. **Baseline page** — Home dashboard (gating, 24-col grid, modules, Recharts, `StatCards`, `ActivityFeed`). **Gate:** real data renders; endpoint-less module → `EmptyState`.
7. **Cleanup + verify** — remove dead Base UI refs, WIP login placeholders (hardcoded 测试 button, demo Badge), unused imports.

## Verification

- `pnpm --filter rapidkit-admin typecheck`
- `pnpm --filter rapidkit-admin lint` (oxlint)
- `pnpm --filter rapidkit-admin build`
- Manual: desktop collapse/expand; mobile nav; route nav + refresh; active menu state; light/dark toggle; auth/permission (menu reflects backend); tables/forms/dialogs; loading/empty/error; clean console.

## Out of scope (noted, not faked)

Global command-palette search; fullscreen toggle; header language switch; the other 6 layout modes + full theme-drawer + watermark; non-Home feature pages (users/menus/monitoring/etc. — follow-up specs); any dashboard module lacking a backend endpoint (renders `EmptyState`).

## Risks / tradeoffs

- Base UI→Radix prop shifts touch 3 consumers (bounded, phase-gated).
- Icon-name→Lucide mapping needs a fallback for any unmapped backend icon.
- Backend module coverage for some dashboard cards is uncertain → those degrade to `EmptyState` rather than mock data.
- Where reference (Vue) architecture conflicts with admin's existing business architecture, **keep admin's architecture** and migrate only visual design + UX.

## Component mapping (Vue → React)

| Vue (`apps/frontend`) | React (`apps/admin`) |
|---|---|
| `base-layout` + `materials/admin-layout` | `AdminShell` (refactor `admin-layout.tsx`) |
| `global-header` | `Header` (extend `header.tsx`) |
| `global-sider` + `global-menu/*` | `Sidebar` + `SidebarMenu` (recursive) |
| `global-tab` (chrome-tab) | `PageTabs` (restyle `tab-bar.tsx`) |
| `global-breadcrumb` | `Breadcrumbs` |
| `UserMenu` | `UserMenu` |
| `theme-schema-switch` | `ThemeToggle` |
| Pinia `theme`/`app` stores | existing Zustand `theme`/`app` stores |
| `NEmpty` / `NSpin` / `exception-base` | `EmptyState` / `LoadingState` / `ErrorState` |
| Iconify `SvgIcon` | Lucide React (via `icon-map.ts`) |
| ECharts | Recharts |
