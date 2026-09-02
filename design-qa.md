# Design QA — navigation user menu

- Source visual truth: `/tmp/product-design-audit/nav-avatar/02-open.png`
- Implementation: `/tmp/product-design-audit/nav-avatar/04-implemented-open.png`
- Viewport and pixels: 1280 × 720 CSS px, device scale factor 1; both captures are 1280 × 720 px, so no density normalization was required.
- State: authenticated home page, light theme, user menu open.
- Full-view evidence: the before/after captures were reviewed together at matching viewport and state. The avatar-only trigger reduces header noise without shifting adjacent controls, while the expanded panel now has a clear identity → action hierarchy.
- Focused-region evidence: the top-right header region is legible at full capture size, so a separate crop was unnecessary. The 40 × 40 trigger, 32 px avatar, 220 px identity row, divider, and logout row were checked directly.

## Required fidelity surfaces

- Fonts and typography: existing project font stack retained; identity name uses 14 px/600 and secondary email uses 12 px with the existing secondary-text token.
- Spacing and layout rhythm: trigger is a square 40 px target; dropdown content uses 14 px horizontal padding, a 12 px identity gap, and a divider before the action.
- Colors and visual tokens: background, primary focus outline, and three text levels use existing theme tokens; the existing `AppAvatar` gradient is preserved.
- Image quality and asset fidelity: no new raster or custom icon assets were introduced; the shared avatar and Phosphor sign-out icon remain sharp at their rendered sizes.
- Copy and content: display name and email/username are shown only after expansion; the existing localized logout copy is unchanged.

## Findings

- No actionable P0/P1/P2 visual differences remain.

## Interaction and accessibility checks

- Avatar trigger opens and closes the dropdown.
- Trigger exposes an accessible name, `aria-haspopup="menu"`, and live expanded state.
- Existing logout confirmation flow remains wired to the same menu key.
- Browser console errors checked: none attributable to the change.

## Comparison history

- Initial source showed a wide avatar + name + caret trigger and a one-row dropdown.
- Implemented an avatar-only trigger, moved identity into the dropdown header, added a divider, and retained logout.
- Post-fix evidence: `/tmp/product-design-audit/nav-avatar/04-implemented-open.png`; no P0/P1/P2 findings.

## Follow-up polish

- None required for this scope.

final result: passed
