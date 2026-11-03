# Amorri Studio Motion System 1.0 (R6)

Read `CLAUDE.md`, `AGENTS.md`, `docs/AI_HANDOFF.md`, and `docs/DESIGN_SYSTEM.md` before editing.

## Active effects (not just recoloring)

- **Buttons:** lift/press with depth shadow, pointer-position ripple on mouse press, champagne light sweep on primary actions, icon motion; keyboard focus remains visible.
- **Dashboard:** 3D pointer-responsive tilt and spotlight on KPI cards and hero; staggered KPI entry; live count-up visuals; gently floating hero art and animated progress bars.
- **Navigation:** tab/view switch enters with opacity/translate; sidebar icons slide and scale, selected segment indicators transition.
- **Calendar:** transitions on month/week/list mount, button press feedback, subtle hover border and event lift (no animated scroll or 42 heavy 3D cells).
- **Booking dialog:** short perspective entrance, staggered service options, step transition, accessible focus rings.
- **Analytics, payroll, delivery and system panels:** gentle entry and card motion without touching Firebase/Drive/R2 behavior.
- **Public client delivery / staff portal / login:** short entrance effects and actionable card/button hover or press states; no filters or transforms on videos/images.

## Implementation

- `app/amorri-motion-system.css` imported *after* `app/amorri-design-system.css` in `app/layout.tsx`.
- `components/AmorriMicroInteractions.tsx`: delegated pointer listeners; uses `requestAnimationFrame` to update CSS variables only for hovered KPI/hero, no React re-render or persistent timer. No event data or credentials.
- `components/AnimatedCount.tsx`: 700ms visual KPI count-up. Screen readers receive stable final numbers.
- Scoped class `amorri-view-motion` is keyed by dashboard tab/month or system sub-tab, so motion plays on navigation. Calendar grids are keyed by month/week.

## Accessibility and performance

- With `prefers-reduced-motion: reduce`, all new animations and tilts are disabled and count-up jumps to final value.
- Pointer tilt/ripple only on fine mouse pointers, not touch. No external animation libraries, WebGL, canvas or per-frame React state.
- Do not animate video/images with filters; media delivery and 1080p playback paths stay intact.
- Test hover/press/keyboard focus and reduced-motion in a real browser after deploy.

## Verification

- `npm run typecheck`, `npm test`, `npm run test:unit`, `node scripts/check-static.mjs`, `npm run build`.
- `tests/amorri-motion-r6.test.mjs` protects actual hooks and reduced-motion behavior.
- User applies full source ZIP on Windows PowerShell with checked hashes; never push without all gates passing.
