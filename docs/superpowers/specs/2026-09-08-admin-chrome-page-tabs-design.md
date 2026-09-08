# Admin Chrome-style page tabs design

## Goal

Update the page tabs at the top of the `apps/admin` content area so their shape matches the Chrome-style tabs used by `apps/frontend`. The change is visual only: `apps/admin` keeps its current theme colors and existing tab behavior.

## Scope

- Change the visual structure and styling of `PageTabs` in `apps/admin`.
- Preserve tab activation, closing, middle-click closing, context-menu actions, horizontal overflow, focus management, and keyboard navigation.
- Preserve the current `apps/admin` light and dark theme system.
- Do not copy the blue-purple color values from `apps/frontend`.
- Do not change tab state, route state, layout state, or shared UI component APIs.

## Visual design

The tab strip remains 44 pixels high and sits between the header and page content. Tabs align to the bottom of the strip.

Each tab uses the overlapping Chrome silhouette from `apps/frontend`: a rounded upper body with curved lower shoulders, rendered as a reusable React SVG background. Adjacent tabs overlap slightly so the shoulders join without visible gaps. The active tab sits above its neighbors through stacking order.

The active tab uses the existing admin page background and primary text color. Inactive tabs remain transparent over the existing muted tab-strip background. Hovered tabs use the existing admin background or accent tokens. A short separator appears between idle inactive tabs and disappears for active or hovered tabs.

Tab labels retain their current truncation and maximum width. The close control stays within the tab silhouette, uses the existing muted and accent theme tokens, and remains easy to target without changing tab activation behavior.

Both light and dark modes derive every color from the current `apps/admin` CSS variables, including `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--accent`, `--primary`, and `--border`.

## Component design

Add a focused `ChromeTabBackground` component beside `page-tabs.tsx`. It owns only the scalable SVG silhouette and accepts styling through `currentColor` and ordinary class names. `PageTabs` continues to own behavior and accessibility.

Within each dropdown wrapper, the tab container becomes a relatively positioned overlapping layer. The SVG background is absolutely positioned behind the interactive content. Label and close controls remain normal DOM controls above it. This keeps the current dropdown trigger, refs, event handlers, and ARIA semantics intact.

## Interaction and accessibility

All current interactions remain unchanged:

- Clicking activates a tab.
- Middle-click closes a closable tab.
- Right-click and Shift+F10 open the context menu.
- Arrow keys, Home, and End move focus.
- Enter and Space activate the focused tab.
- Closing a tab restores focus to the appropriate surviving tab.

The SVG background is decorative and hidden from assistive technology. Focus-visible rings remain visible around the tab trigger and close control.

## Testing and verification

- Keep the existing navigation and close-behavior unit tests passing.
- Add a focused render test that checks the Chrome background and active/inactive state hooks without testing raw pixel output.
- Run the `apps/admin` PageTabs tests.
- Run the `apps/admin` type checker.
- Run the `apps/admin` production build.
- Inspect the result in both light and dark themes at desktop width, including a tab set wide enough to overflow horizontally.

## Acceptance criteria

- The top tabs visibly match the shape and overlap behavior of the `apps/frontend` Chrome-style tabs.
- No frontend-specific fixed theme color is introduced into `apps/admin`.
- Light and dark themes remain coherent.
- Existing tab behaviors and accessibility semantics do not regress.
- PageTabs tests, type checking, and production build pass.
