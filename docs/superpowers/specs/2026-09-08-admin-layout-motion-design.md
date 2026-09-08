# Admin layout motion design

## Goal

Bring the `apps/admin` sidebar and page navigation motion in line with the existing `apps/frontend` behavior. Sidebar collapse and expansion should feel continuous, and route changes should use the frontend default `fade-slide` transition.

## Reference behavior

`apps/frontend` uses 300-millisecond layout transitions and a page transition named `fade-slide`. The outgoing page fades while moving 30 pixels to the right. After it leaves, the incoming page fades in from 30 pixels to the left. Vue runs these phases in `out-in` mode.

The admin implementation will reproduce these timings and directions with React and CSS without adding an animation dependency.

## Sidebar motion

The sidebar width and the main content offset will continue to transition between the existing `--sidebar-width` and `--sidebar-width-collapsed` tokens. Both transitions will use a 300-millisecond ease-in-out curve so their edges remain synchronized.

The sidebar will clip horizontal overflow during the width transition. Its brand title will remain mounted and animate its available width and opacity instead of disappearing immediately. Icons remain fixed-size.

Menu rendering uses a presentation state separate from the persisted collapse state. On collapse, the expanded menu remains visible while the sidebar clips it during the 300-millisecond width change, then switches to the centered icon, tooltip, and flyout presentation. On expansion, it switches to the expanded menu presentation before the width grows, allowing labels to be revealed by the widening sidebar. This avoids trying to render the structurally different collapsible and flyout menus at the same time. Expanded menu groups retain their current disclosure behavior. Mobile navigation is out of scope because the desktop sidebar is not rendered on mobile.

## Page transition architecture

Add a focused `RouteTransition` component in the layout directory. It receives the current routed element and pathname from React Router and owns only the visual transition state.

When the pathname changes, the component keeps rendering the previous route during a 300-millisecond exit phase. When the exit animation completes, it replaces the rendered route with the new outlet and starts the 300-millisecond entrance phase. This reproduces Vue's `out-in` ordering and prevents old and new pages from overlapping.

The route transition wrapper fills the available content height. It does not change route state, tab state, page component APIs, or authentication guards. The content scroll container resets to the top between exit and entrance, matching the frontend behavior.

Rapid consecutive navigation requests keep only the newest pending route. A stale animation completion cannot restore an older route.

## CSS motion

Global CSS defines named layout-motion classes:

- Exit: opacity transitions from 1 to 0 while horizontal translation moves from 0 to 30 pixels.
- Enter: opacity transitions from 0 to 1 while horizontal translation moves from -30 pixels to 0.
- Each phase lasts 300 milliseconds.
- Layout properties used by the sidebar use the same duration and easing.

A `prefers-reduced-motion: reduce` media query reduces the page transition to an immediate route replacement and removes the sidebar's long movement. Navigation and content remain fully usable.

## Accessibility and interaction

- Existing menu focus rings, tooltips, popovers, active states, and keyboard interaction remain unchanged.
- Decorative motion does not add focusable elements or alter the document reading order.
- The outgoing page becomes non-interactive during its exit phase so users cannot trigger stale controls.
- Reduced-motion preferences are honored for both layout and route animation.

## Testing and verification

- Unit-test the route transition phase reducer or helper using deterministic events rather than real-time sleeps.
- Render-test that route changes expose exit and enter states in the correct order.
- Test sidebar animation class selection for expanded and collapsed states.
- Keep existing sidebar, tabs, routing, and layout tests passing.
- Run the full `apps/admin` test suite, TypeScript type checking, and production build.
- Check the final implementation for fixed colors and unrelated behavioral changes.

## Acceptance criteria

- Desktop sidebar width, main content offset, brand label, and menu presentation changes animate coherently over 300 milliseconds.
- Page navigation matches the frontend default `fade-slide` directions and uses out-in sequencing.
- Rapid navigation does not display an obsolete route.
- Reduced-motion users do not receive the full sliding animation.
- Existing navigation behavior and tests do not regress.
