# Final integration hardening report

## Outcome

- Backend component grammar is parsed instead of treated as a filesystem path. `layout.*` nodes render an `Outlet`; `view.*` names map underscores/dots to nested React view directories; composite `layout.*$view.*` routes render their view. Missing views retain the graceful 404 fallback.
- Dynamic navigation uses the complete permission-filtered `UserRouteResponse.routes`. The root redirect resolves `UserRouteResponse.home` as a route **name**, falls back to the first authorized leaf when the backend name is stale, and uses `/404` when the authorized route set is empty. There is no unconditional static `/home` route.
- React Query transport failures and flat-response `error` values both render the localized retry state without navigating away from the requested URL. Route-store data is not replaced by an empty tree on a flat-response error.
- `meta.i18nKey` is modeled and retained by the route store. Sidebar labels, collapsed labels/tooltips, group labels, and breadcrumbs translate at render time with the backend title as `defaultValue`. EN/ZH keys matching current backend seeds were added.
- The theme radius default is 6px. Persist version 1 migrates the legacy version-0 default value 8 to 6 and preserves every other legacy value plus all versioned values.

## Tests added

- Real backend-shaped route payload covering `layout.base`, `view.manage_user`, `layout.base$view.home`, nested matching, authorized home lookup, stale-home fallback, and empty-route fallback.
- Flat-response error state and deep-link URL preservation.
- Route-store `i18nKey` retention and runtime label translation/fallback.
- Theme persistence migration of legacy default and explicit choices.

## Verification

- `pnpm --filter rapidkit-admin exec tsx --test $(find src -name '*.test.ts' -print | sort)` — 39 passed, 0 failed.
- `pnpm --filter rapidkit-admin typecheck` — passed.
- `pnpm --filter rapidkit-admin lint` — 0 warnings, 0 errors.
- `pnpm --filter rapidkit-admin build` — passed (2,565 modules transformed).
- `pnpm --filter @rapidkit/ui typecheck` — passed.
- `git diff --check` — passed.

## Design rulings and concerns

- Zustand's previous unversioned persisted payload cannot distinguish an explicit user choice of exactly 8px from the shipped 8px default. The reversible, narrow migration changes only version-0 `radius === 8`; non-8 choices and all already-versioned state are preserved.
- Backend view names currently map by the established convention (`manage_user` → `views/manage/user`, `queue_dashboard` → `views/queue/dashboard`). Views absent from this admin baseline intentionally resolve to the localized 404 page rather than preventing child-route matching.
- Vite emits existing deprecation recommendations for React Babel/esbuild and optimizeDeps configuration during the successful build; they are unrelated to this fix.
