# Homepage Design QA

## Comparison target

- Source: selected Product Design option 3 (`1440 × 1024`).
- Implementation: authenticated `/home` at `1440 × 1024`, light theme, admin dashboard state.
- Evidence: `/tmp/rapidkit-home-comparison-final.png` combines the source and final implementation at the same viewport.

## Findings and fixes

- P2 — Health-check separators initially resolved to an undefined legacy token and rendered too dark. Replaced them with NaiveUI's `--n-border-color`; verified as `rgb(239, 239, 245)` in the rendered page.
- P2 — Existing activity data appeared too late in the page compared with the selected hierarchy. Moved the existing activity module directly below the overview and paired it with business data while preserving permission keys and API data.
- P2 — Narrow layouts could have forced the metric strip into horizontal overflow. The strip now collapses to two columns, and the `768 × 900` browser check reported `scrollWidth === clientWidth === 768`.
- P3 — The source mock uses a tabular recent-activity presentation and a dedicated pending-actions panel. The existing product exposes a timeline activity feed and business summary instead; these were intentionally preserved to avoid inventing or removing functionality.

## Fidelity surfaces

- Fonts and typography: existing product font stack preserved; title, section, metric, and metadata hierarchy align with the source direction.
- Spacing and layout rhythm: 24-column responsive grid, 14px module gaps, compact header, segmented overview, 15/9 primary split, and matching fixed-height paired modules.
- Colors and tokens: existing primary palette and semantic status colors retained; neutral surfaces and NaiveUI divider tokens replace decorative gradients.
- Image and icon fidelity: no raster assets are required by the source; existing Carbon icon system and ECharts visualizations are preserved.
- Copy and content: existing localized dashboard labels and live API-backed values remain intact; greeting and date reuse current locale and user data.
- Interactions: refresh, trend ranges, custom date range, instance selector, permission states, and real-time dashboard updates remain available.

## Remaining polish

- P3 — A future iteration could add real backend-backed pending-action and shortcut modules if those capabilities become part of the dashboard contract.

final result: passed

---

# Recent Activity Screenshot Fidelity QA

## Comparison target

- Source visual truth: `/tmp/codex-clipboard-ecf79924-395e-4b5f-83e7-1b22a09b1b1e.png` (`713 × 313` px).
- Implementation screenshot: `/tmp/rapidkit-dashboard-activity-final.png` at a `1440 × 1000` CSS viewport and device scale factor 1.
- Focused comparison: `/tmp/rapidkit-activity-comparison.png`; the rendered activity card was cropped from the authenticated home page and normalized to the source width for side-by-side review.
- State: authenticated admin home, light theme, “全部” selected, five live activity records.

## Findings

- No actionable P0/P1/P2 fidelity differences remain.
- P3 — Live task names are longer than the mock copy, so the content column truncates earlier. This is intentional: the row preserves all five requested columns at the existing dashboard module width, and the full content remains available in the detail drawer.

## Required fidelity surfaces

- Fonts and typography: existing RapidKit font stack retained; 16px/700 title, 12px/600 headers, 13px rows, tabular timestamps, and compact semantic labels match the reference hierarchy.
- Spacing and layout rhythm: title, filters, action, six-track row grid, five visible records, 47px row rhythm, subtle dividers, and rounded card align with the source. The implementation adapts to its existing 15/9 dashboard grid and hides the user column on narrow screens.
- Colors and visual tokens: primary selected filter, semantic success/warning/error colors, neutral dividers, container surface, and text levels use the existing NaiveUI tokens; no hard-coded light-only palette was introduced.
- Image quality and asset fidelity: the source contains no raster imagery. Status dots use NaiveUI badges and arrows use the existing Carbon icon library; no custom SVG or placeholder art was introduced.
- Copy and content: labels match the source structure while row values come from the real activity API and existing localization keys.

## Interaction and accessibility checks

- All five category filters update the selected state and request filtered backend data.
- “查看全部活动” opens a complete activity drawer.
- Clicking an activity in the card or drawer opens a detail drawer with time, category, content, user, result, and event code.
- Rows are keyboard-focusable buttons, filters expose `aria-pressed`, and the table exposes row/column semantics.
- Fresh browser verification reported no console errors.

## Comparison history

- Initial implementation matched the screenshot structure and interactions but the detail view used `NCode`, which emitted a missing-highlighter console warning.
- Replaced that nonessential code renderer with theme-aware inline code text.
- Final browser capture and interaction pass found no remaining P0/P1/P2 issues.

## Follow-up polish

- P3 — If the activity module becomes full-width, the content column can display more of long task names before truncation.

final result: passed
